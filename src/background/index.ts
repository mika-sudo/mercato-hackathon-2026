import { Broker } from "./broker";
import { JevClient } from "./jev-client";
import { MockClassifierApi } from "./mock-api";
import { configuration } from "../shared/config";
import { CHANNEL } from "../shared/messages";

const api =
  configuration.useMock || !configuration.apiBaseUrl
    ? new MockClassifierApi()
    : new JevClient({
        baseUrl: configuration.apiBaseUrl,
        apiKey: configuration.apiKey
      });

const broker = new Broker(api);

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object") return false;

  // InboxSDK asks before the declarative MAIN-world bridge has completed.
  if ("type" in message && message.type === "inboxsdk__injectPageWorld") {
    sendResponse(
      Object.keys(message).length === 1 &&
        Boolean(configuration.inboxSdkAppId) &&
        broker.isContentSender(sender)
    );
    return false;
  }

  if (!("channel" in message) || message.channel !== CHANNEL || !("kind" in message)) {
    return false;
  }

  void broker.handle(message, sender).then(sendResponse);
  return true;
});
