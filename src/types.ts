import type { Timestamp } from "firebase/firestore";
export type Profile = {
  uid: string;
  username: string;
  displayName: string;
  bio: string;
  avatar: string;
  photoURL?: string | null;
  discoverable: boolean;
  showPresence: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};
export type Chat = {
  id: string;
  kind: "direct" | "group";
  avatar?: string;
  members: string[];
  admin: string;
  name: string;
  description: string;
  updatedAt: Timestamp | null;
  createdAt: Timestamp | null;
  lastText: string;
  lastSender: string;
};
export type Message = {
  id: string;
  sender: string;
  text: string;
  createdAt: Timestamp | null;
  editedAt: Timestamp | null;
  deleted: boolean;
  reply: { id: string; text: string } | null;
  pending?: boolean;
};
export type Receipt = {
  readAt?: Timestamp;
  deliveredAt?: Timestamp;
  hiddenAt?: Timestamp;
  typingUntil?: number;
};
export type CallState =
  | "ringing"
  | "connecting"
  | "connected"
  | "ended"
  | "rejected"
  | "missed"
  | "failed";
export type Call = {
  id: string;
  chatId: string;
  caller: string;
  callee: string;
  participants: string[];
  kind: "voice" | "video";
  state: CallState;
  offer: RTCSessionDescriptionInit;
  answer: RTCSessionDescriptionInit | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  expiresAt: Timestamp;
};
