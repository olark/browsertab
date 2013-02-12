# BrowserTab

Building Javascript applications that run across multiple browser tabs
can be tricky:

1. **Which browser tab is visible (if any)?** You may want to do less work
   if you know that your current tab is not visible anyway.
2. **Which browser tab is primary?**  You may not want all tabs to process
   a server side event at the same time.  For example, you would not want
   all of your tabs to generate a "new message" alert or sound.

**BrowserTab** encapsulates all of this behavior into a simple API:

* `BrowserTab.hidden()` true when the current tab is hidden from the visitor
* `BrowserTab.primary()` true when the current tab is the most-recently-used tab

# Usage

In the browser, just include the module with `<script src="browsertab.js"></script>`.
Then you should be able to use the global BrowserTab object:

```javascript
if (BrowserTab.hidden()) {
  // This tab is not visible, maybe you can stop requesting data from the server
}

if (BrowserTab.primary()) {
  // This tab is primary, should be okay to trigger things like sounds from this one
}
```

You can also listen for changes to hidden/primary state:

```javascript
BrowserTab.on("change:hidden", function() {
  // This tab changed from visible to hidden, or vice-versa.
});

BrowserTab.on("change:primary", function() {
  // This tab changed from primary to non-primary, or vice-versa.
});
```

## Advanced Usage

You can use BrowserTab in node:

1. Install the module using `npm install browsertab`
2. At the top of your code, `var BrowserTab = require("browsertab")`
3. Create a new BrowserTab object, for example: `var tab = new BrowserTab({window: jsdom().createWindow()})`

In general, you can inject all of the BrowserTab dependencies using the options:

```javascript
var tab = new BrowserTab({
  window: window, // override window (helpful when mocking in unit tests)
  document: document, // override document (helpful when mocking in unit tests)
  localStorage: localStorage, // override localStorage (helpful when mocking in unit tests)
  storageNamespace: "_BrowserTabStorageNamespace" // change storage namespace for coordinating "primary" tab
})
```

## Contributing

**Found a bug? Have a new idea?** Fork away and send us a pull request!
Or [call us, maybe](https://olark.com/jobs)?