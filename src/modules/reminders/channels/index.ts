import type { MessageChannel } from "../types";
import { MockMessageChannel } from "./mock-channel";

export * from "./mock-channel";

let channelOverride: MessageChannel | null = null;
let defaultChannel: MessageChannel | null = null;

/** Returns the active messaging channel (mock for the core build). */
export function getMessageChannel(): MessageChannel {
    if (channelOverride) return channelOverride;
    if (!defaultChannel) defaultChannel = new MockMessageChannel();
    return defaultChannel;
}

/** Overrides the channel (unit tests). Pass null to reset. */
export function setTestMessageChannel(channel: MessageChannel | null): void {
    channelOverride = channel;
}