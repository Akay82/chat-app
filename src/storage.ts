// The default deployment has no persistent uploads. Integrations must return HTTPS URLs,
// enforce authenticated ownership and validate size/content on their trusted backend.
export interface StoredAttachment {
  url: string;
  name: string;
  kind: "image" | "audio" | "file";
  bytes: number;
}
export interface AttachmentStorage {
  upload(
    file: File,
    context: { uid: string; chatId: string; signal: AbortSignal },
  ): Promise<StoredAttachment>;
  remove(attachment: StoredAttachment): Promise<void>;
}
let provider: AttachmentStorage | null = null;
export const configureAttachmentStorage = (storage: AttachmentStorage) => {
  provider = storage;
};
export const attachmentStorage = () => provider;
export const attachmentLimits = {
  image: 5 * 1024 * 1024,
  audio: 10 * 1024 * 1024,
  file: 10 * 1024 * 1024,
} as const;
