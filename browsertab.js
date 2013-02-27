;(function(){

  /*
  BrowserTab

  Helper object for tracking whether a browser tab is "primary" and/or "hidden".

  * `options.window` window object (defaults to global window)
  * `options.document` document object (defaults to global document)
  * `options.localStorage` localStorage to use (defaults to global localStorage if exists, otherwise falls back to a cookie store)
  * `options.storageNamespace` namespace for store to coordinate "primary" tabs (defaults to "_BrowserTabStorageNamespace")
  */
  function BrowserTab(options) {
    var self = this;
    options = options || {};

    this._win = options.window || window;
    this._doc = options.document || this._win.document;
    this._prefixes = ["webkit", "moz", "ms", "o"];

    // Only allow one tab to be "primary" per domain.
    this.store = options.localStorage || this._win.localStorage || new BrowserTab.CookieStore(this._doc);
    this._storageNamespace = options.storageNamespace || "_BrowserTabStorageNamespace";
    this._id = ("" + Math.random() + Math.random()).replace(/\./g, "");

    // initialize array storing callbacks to be fired if a tab becomes a primary again
    this.switchedPrimaryCallbacks = [];

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

    // http://www.quirksmode.org/js/cookies.html
    BrowserTab.CookieStore = function(doc) {
      this.doc = doc;
    };

    BrowserTab.CookieStore.prototype.getItem = function(name) {
      var nameEQ = name + "=";
      var ca = this.doc.cookie.split(';');
      for(var i=0;i < ca.length;i++) {
        var c = ca[i];
        while (c.charAt(0)==' ') c = c.substring(1,c.length);
        if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
      }
      return null;
    };

    BrowserTab.CookieStore.prototype.setItem = function(name, value) {
      this.doc.cookie = name+"="+value+"; path=/";
    };

    BrowserTab.CookieStore.prototype.removeItem = function(name) {
      this.setItem(name,"");
    }

    // Returns true when this is the most-recently-used tab.
    p.primary = function() {
      if (arguments.length > 0) {
        throw new Error("'primary' property is not settable");
      }
      return this.store.getItem(this._storageNamespace) === this._id;
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
      var self = this;
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
          case "change:hiddenToActive":
            this._listenForVisibilityChange(function(){
              if (!self._blurred) callback();
            });
            break;
          case "change:switchedBackAsPrimary":
            this.switchedPrimaryCallbacks.push(callback);
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
      if (this._win.localStorage) {
        // http://html5doctor.com/storing-data-the-simple-html5-way-and-a-few-tricks-you-might-not-have-known/
        this._listen(this._win, "storage", function(event) {
          event = event || window.event;
          if (event.key === self._storageNamespace) {
            callback();
          }
        });
      }
    };

    p._makePrimary = function() {
      this._previousPrimary = this.store.getItem(this._storageNamespace);
      this.store.setItem(this._storageNamespace, this._id);
      this._currentPrimary = this._id;
      // if a new primary being set after initialization
      if (this._primaryChanged()) {
        for (var i=0; i < this.switchedPrimaryCallbacks.length; i++) {
          setTimeout(this.switchedPrimaryCallbacks[i], 0);
        }
      }
    };

    p._releasePrimary = function() {
      var primaryTabID = this.store.getItem(this._storageNamespace);
      if (primaryTabID === this._id) {
        this.store.removeItem(this._storageNamespace);
      }
    };

    p._anyTabsPrimary = function() {
        var primaryTabID = this.store.getItem(this._storageNamespace);
        return primaryTabID !== "undefined" && !!primaryTabID;
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

      this._makePrimary()
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
        self._previouslyBlurred = self._blurred;
        self._blurred = true;
        self._uncertain = false;
        triggerBlurChangeCallbacks();
      }

      function focus() {
        self._previouslyBlurred = self._blurred;
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

    p._stateChanged = function() {
      return this._previouslyBlurred !== this._blurred;
    };

    p._primaryChanged = function() {
      return this._previousPrimary !== this._currentPrimary);
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
