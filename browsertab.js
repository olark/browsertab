;(function(){

  /*
  BrowserTab

  Helper object for tracking whether a browser tab is "primary" and/or "hidden".

  * `options.window` window object (defaults to global window)
  * `options.document` document object (defaults to global document)
  * `options.localStorage` localStorage to use (defaults to global localStorage)
  * `options.idStorageKey` namespace for localStorage to coordinate "primary" tabs (defaults to "_BrowserTabIDStorageKey")
  */
  function BrowserTab(options) {
    var self = this;
    options = options || {};

    this._win = options.window || window;
    this._doc = options.document || this._win.document;
    this._prefixes = ["webkit", "moz", "ms", "o"];

    // Only allow one tab to be "primary" per domain.
    this._localStorage = options.localStorage || this._win.localStorage;
    this._idStorageKey = options.idStorageKey || "_BrowserTabIDStorageKey";
    this._id = ("" + Math.random() + Math.random()).replace(/\./g, "");
    function release() {
      self._releasePrimary();
    }
    this._listen(this._win, "unload", release);
    this._listen(this._win, "beforeunload", release);

    // Use the Visibility API if available, otherwise fallback to focus/blur.
    // http://www.nczonline.net/blog/2011/08/09/introduction-to-the-page-visibility-api/
    if (this._supportsVisibility()) {
      this._initializeWithVisibility();
    } else {
      this._initializeWithBlurring();
    }

    // Initialize primary state.
    if (!this.hidden() || !this._anyTabsPrimary()) {
      this._makePrimary();
    }
  }

  ;(function(p){

    // Expose class-level primary/hidden attributes for the common case.
    var globalInstance;

    BrowserTab.primary = function primary() {
      globalInstance = globalInstance || new BrowserTab();
      return globalInstance.primary();
    };

    BrowserTab.hidden = function hidden() {
      globalInstance = globalInstance || new BrowserTab();
      return globalInstance.hidden();
    };

    BrowserTab.on = function on() {
      globalInstance = globalInstance || new BrowserTab();
      return globalInstance.on.apply(globalInstance, arguments);
    };

    // Returns true when this is the most-recently-used tab.
    p.primary = function() {
      if (arguments.length > 0) {
        throw new Error("'primary' property is not settable");
      }
      if (!this._localStorage) {
        if (window.console && window.console.warn) {
          window.console.warn("localStorage is required to use the primary() property");
        }
      }
      return this._localStorage.getItem(this._idStorageKey) === this._id;
    };

    // Returns true when this tab is hidden from view.
    p.hidden = function() {
      if (arguments.length > 0) {
        throw new Error("'hidden' property is not settable");
      }
      if (this._supportsVisibility()) {
        return this._getProperty(this._doc, "hidden");
      } else {
        return this._blurred;
      }
    };

    // Listens for changes to the hidden and primary attributes.
    p.on = function(events, callback) {
      events = events.split(/\s+/);
      for (var i=0; i < events.length; i++) {
        var event = events[i];
        switch (event) {
          case "change:hidden":
            this._listenForVisibilityChange(callback);
            break;
          case "change:primary":
            this._listenForPrimaryChange(callback);
            break;
          default:
            throw new Error("invalid event '" + event + "'");
        }
      }
    };

    // Define private helpers.
    p._getProperty = function(obj, name) {
      var prefixableName = name.charAt(0).toString().toUpperCase() + name.slice(1);
      if (name in obj) {
        return obj[name];
      } else {
        var value;
        this._eachBrowserPrefix(function(prefix) {
          var prefixedName = prefix + prefixableName;
          if (prefixedName in obj) {
            value = obj[prefixedName];
          }
        });
        return value;
      }
    };

    p._supportsVisibility = function() {
      var visibilityState = this._getProperty(this._doc, "visibilityState");
      return visibilityState !== "undefined";
    };

    p._eachBrowserPrefix = function(callback) {
      for (var i=0; i < this._prefixes.length; i++) {
        callback(this._prefixes[i]);
      }
    };

    p._listen = function(el, ev, fn) {
      // http://javascriptrules.com/2009/07/22/cross-browser-event-listener-with-design-patterns/
      // http://stackoverflow.com/questions/2490825/how-to-trigger-event-in-javascript
      if (el.addEventListener) {
         el.addEventListener(ev, fn, false);
      } else if (el.attachEvent) {
         el.attachEvent('on' + ev, fn);
      } else {
         el['on' + ev] = fn;
      }
    };

    p._listenForVisibilityChange = function(callback) {
      var self = this;
      this._listen(this._doc, "visibilitychange", callback);
      this._eachBrowserPrefix(function(prefix) {
        self._listen(self._doc, prefix + "visibilitychange", callback);
      });

      // If we are using blur changes, use that callback list instead.
      if (this._blurChangeCallbacks) {
        this._blurChangeCallbacks.push(callback);
      }
    };

    p._listenForPrimaryChange = function(callback) {
      var self = this;
      if (this._localStorage) {
        // http://html5doctor.com/storing-data-the-simple-html5-way-and-a-few-tricks-you-might-not-have-known/
        this._listen(this._win, "storage", function(event) {
          event = event || window.event;
          if (event.key === self._idStorageKey) {
            callback();
          }
        });
      }
    };

    p._makePrimary = function() {
      if (this._localStorage) {
        this._localStorage.setItem(this._idStorageKey, this._id);
      }
    };

    p._releasePrimary = function() {
      if (this._localStorage) {
        var primaryTabID = this._localStorage.getItem(this._idStorageKey);
        if (primaryTabID === this._id) {
          this._localStorage.removeItem(this._idStorageKey);
        }
      }
    };

    p._anyTabsPrimary = function() {
      if (this._localStorage) {
        var primaryTabID = this._localStorage.getItem(this._idStorageKey);
        return primaryTabID !== "undefined";

      // When no localStorage available, fail open.
      } else {
        return false;
      }
    };

    p._initializeWithVisibility = function() {
      var self = this;
      this._blurred = this.hidden();
      this._uncertain = false;

      function syncPrimary() {
        self._blurred = self.hidden();
        if (!self.hidden()) {
          self._makePrimary();
        }
      }

      syncPrimary();
      this._listenForVisibilityChange(syncPrimary);
    };

    p._initializeWithBlurring = function() {
      // The main limitation with this fallback is that onblur is never called
      // when switching tabs (only when switching windows).
      var self = this;
      this._blurred = false;
      this._uncertain = true;
      this._blurChangeCallbacks = blurChangeCallbacks = [];

      function triggerBlurChangeCallbacks() {
        for (var i=0; i < blurChangeCallbacks.length; i++) {
          setTimeout(blurChangeCallbacks[i], 0);
        }
      }

      function blur() {
        self._blurred = true;
        self._uncertain = false;
        triggerBlurChangeCallbacks();
      }

      function focus() {
        self._blurred = false;
        self._uncertain = false;
        self._makePrimary();
        triggerBlurChangeCallbacks();
      }

      // IE9 and lower have focusin/out on document.
      this._listen(this._doc, "focusin", focus);
      this._listen(this._doc, "focusout", blur);

      // All other browsers have focus/blur on window.
      this._listen(this._win, "focus", focus);
      this._listen(this._win, "blur", blur);

      // Since focus may not always trigger (e.g. when switching tabs),
      // we also use other actions to consider this tab focused.
      this._listen(this._doc, "scroll", focus);
      this._listen(this._doc, "keydown", focus);
      this._listen(this._doc, "mousemove", focus);
      this._listen(this._doc, "select", focus);

      this._listen(this._win, "scroll", focus);
      this._listen(this._win, "keydown", focus);
      this._listen(this._win, "mousemove", focus);
      this._listen(this._win, "select", focus);

      // When this becomes non-primary, it also must be blurred.
      this._listenForPrimaryChange(function() {
        if (!self.primary()) {
          blur();
        }
      });
    };

  })(BrowserTab.prototype);

  // Export for CommonJS.
  if (typeof module !== "undefined") {
    module.exports = BrowserTab;

  // Export for AMD loaders.
  } else if (this.define && this.define.amd) {
    this.define(function(){return BrowserTab});

  // For vanilla browser includes.
  } else {
    this.BrowserTab = BrowserTab;
  }

}).call(this);
