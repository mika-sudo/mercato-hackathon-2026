// Declarative MAIN-world scripts run at document_end, when <head> exists.
// The packaged InboxSDK pageWorld.js checks this marker before running.
if (location.origin === "https://mail.google.com" && document.head) {
  document.head.setAttribute("data-inboxsdk-script-injected", "true");
}
