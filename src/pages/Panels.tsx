import { useEffect, useRef, useState } from "react";
import { sendEmailVerification } from "firebase/auth";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { useQuery } from "@tanstack/react-query";
import { db } from "../firebase";
import { useSession } from "../session";
import { useSettings } from "../store";
import {
  saveProfile,
  findUser,
  getProfile,
  createGroup,
  startDirect,
  changeMember,
  block,
  deleteAccount,
  logout,
} from "../api";
import { friendly } from "../lib";
import { Avatar, Modal } from "../components";
import type { Chat, Profile } from "../types";
import { showBrowserNotification } from "../notifications";
import { ProfileView } from "../ProfileView";
import {
  loadAvatarPhoto,
  cropAvatarPhoto,
  initialCrop,
  type PhotoCrop,
} from "../avatar-photo";
export function ProfileForm({
  close,
  required = false,
}: {
  close: () => void;
  required?: boolean;
}) {
  const { profile, user } = useSession();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [avatar, setAvatar] = useState(profile?.avatar || "sage"),
    [photoURL, setPhotoURL] = useState<string | null>(
      profile?.photoURL || null,
    ),
    [photoDirty, setPhotoDirty] = useState(false),
    [photoSource, setPhotoSource] = useState<HTMLImageElement | null>(null),
    [crop, setCrop] = useState<PhotoCrop>(initialCrop),
    [photoBusy, setPhotoBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null),
    photoGeneration = useRef(0);
  useEffect(
    () => () => {
      photoGeneration.current++;
    },
    [],
  );
  function changeCrop(next: PhotoCrop) {
    if (!photoSource) return;
    try {
      setPhotoURL(cropAvatarPhoto(photoSource, next));
      setCrop(next);
      setPhotoDirty(true);
    } catch (error) {
      setError(friendly(error));
    }
  }
  return (
    <Modal
      title={required ? "Make it yours" : "Your profile"}
      close={() => {
        if (!required) close();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || photoBusy) return;
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            await saveProfile({
              username: String(data.get("username")),
              displayName: String(data.get("displayName")),
              bio: String(data.get("bio")),
              avatar,
              ...(photoDirty ? { photoURL } : {}),
              discoverable: data.has("discoverable"),
              showPresence: data.has("showPresence"),
            });
            close();
          } catch (e) {
            setError(friendly(e, "profile"));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className={`profile-preview ${photoSource ? "editing" : ""}`}>
          <Avatar
            profile={{
              displayName: profile?.displayName || user?.displayName || "You",
              avatar,
              photoURL,
            }}
          />
          <div>
            <b>A face in the conversation.</b>
            <p className="muted">A photo or a color. Make it you.</p>
          </div>
        </div>
        <div className="photo-actions">
          <input
            hidden
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            aria-label="Choose profile picture"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              const generation = ++photoGeneration.current;
              setPhotoBusy(true);
              setError("");
              try {
                const image = await loadAvatarPhoto(file);
                if (generation !== photoGeneration.current) return;
                const prepared = cropAvatarPhoto(image, initialCrop);
                setPhotoSource(image);
                setCrop(initialCrop);
                setPhotoURL(prepared);
                setPhotoDirty(true);
              } catch (error) {
                if (generation === photoGeneration.current)
                  setError(friendly(error));
              } finally {
                if (generation === photoGeneration.current) setPhotoBusy(false);
              }
            }}
          />
          <button
            type="button"
            className="secondary"
            disabled={busy || photoBusy}
            onClick={() => fileInput.current?.click()}
          >
            {photoBusy
              ? "Preparing photo…"
              : photoURL
                ? "Change photo"
                : "Upload photo"}
          </button>
          {photoURL && (
            <button
              type="button"
              className="subtle"
              disabled={busy || photoBusy}
              onClick={() => {
                photoGeneration.current++;
                setPhotoSource(null);
                setPhotoURL(null);
                setPhotoDirty(true);
              }}
            >
              Remove photo
            </button>
          )}
        </div>
        <p className="muted photo-hint">
          JPG, PNG or WebP · up to 10 MB. Saved as a small square thumbnail.
          Photos are visible to signed-in users who view your profile.
        </p>
        {photoSource && (
          <fieldset className="photo-crop" disabled={busy}>
            <legend>Adjust your photo</legend>
            <label>
              Zoom
              <input
                type="range"
                min="1"
                max="3"
                step="0.05"
                value={crop.zoom}
                onChange={(event) =>
                  changeCrop({
                    ...crop,
                    zoom: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Horizontal position
              <input
                type="range"
                min="-100"
                max="100"
                value={crop.x}
                onChange={(event) =>
                  changeCrop({
                    ...crop,
                    x: Number(event.target.value),
                  })
                }
              />
            </label>
            <label>
              Vertical position
              <input
                type="range"
                min="-100"
                max="100"
                value={crop.y}
                onChange={(event) =>
                  changeCrop({
                    ...crop,
                    y: Number(event.target.value),
                  })
                }
              />
            </label>
          </fieldset>
        )}
        <div className="palette">
          {["sage", "peach", "lavender", "sky", "sun", "rose"].map((a) => (
            <button
              type="button"
              key={a}
              className={`swatch ${a} ${avatar === a ? "selected" : ""}`}
              aria-label={`${a} avatar`}
              aria-pressed={avatar === a}
              onClick={() => setAvatar(a)}
            />
          ))}
          <button type="button" onClick={() => setAvatar("sage")}>
            Reset
          </button>
        </div>
        <label>
          Display name
          <input
            name="displayName"
            required
            maxLength={60}
            defaultValue={profile?.displayName || user?.displayName || ""}
            autoComplete="name"
          />
        </label>
        <label>
          Username
          <input
            name="username"
            required
            pattern="[a-z][a-z0-9_]{2,23}"
            defaultValue={profile?.username}
            placeholder="your_name"
          />
          <small>3–24 lowercase letters, numbers, or underscores.</small>
        </label>
        <label>
          A little about you
          <textarea
            name="bio"
            maxLength={240}
            defaultValue={profile?.bio}
            placeholder="What’s on your mind?"
          />
        </label>
        <label className="check">
          <input
            type="checkbox"
            name="discoverable"
            defaultChecked={profile?.discoverable ?? true}
          />{" "}
          Let people find my exact username
        </label>
        <label className="check">
          <input
            type="checkbox"
            name="showPresence"
            defaultChecked={profile?.showPresence ?? true}
          />{" "}
          Share online status and last seen
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy || photoBusy}>
          {busy ? "Saving…" : required ? "Let’s get together" : "Save profile"}
        </button>
        {required && (
          <button
            type="button"
            className="subtle"
            onClick={() => void logout().catch((e) => setError(friendly(e)))}
          >
            Sign out
          </button>
        )}
      </form>
    </Modal>
  );
}
export function NewChat({
  close,
  open,
  group = false,
}: {
  close: () => void;
  open: (id: string) => void;
  group?: boolean;
}) {
  const [username, setUsername] = useState(""),
    [found, setFound] = useState<Profile | null>(null),
    [members, setMembers] = useState<Profile[]>([]),
    [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={group ? "Better, together" : "Start a conversation"}
      close={close}
    >
      <p className="muted">
        {group
          ? "Create a small circle for your people. Up to 20 members."
          : "Find someone by their exact username."}
      </p>
      {group && (
        <>
          <label>
            Group name
            <input
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="The weekend people"
            />
          </label>
          <label>
            Description
            <textarea
              value={description}
              maxLength={240}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
        </>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            setFound(await findUser(username));
          } catch (e) {
            setError(friendly(e));
            setFound(null);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Username
          <div className="input-row">
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@username"
              required
            />
            <button disabled={busy} className="secondary">
              Find
            </button>
          </div>
        </label>
      </form>
      {found && (
        <div className="person-row">
          <Avatar profile={found} />
          <div>
            <b>{found.displayName}</b>
            <small>@{found.username}</small>
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={async () => {
              if (group) {
                setMembers([
                  ...members.filter((m) => m.uid !== found.uid),
                  found,
                ]);
                setFound(null);
                return;
              }
              setBusy(true);
              try {
                open(await startDirect(found.uid));
                close();
              } catch (e) {
                setError(friendly(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {group ? "Add" : "Say hello ↗"}
          </button>
        </div>
      )}
      {members.map((m) => (
        <div className="person-row" key={m.uid}>
          <Avatar profile={m} />
          <b>{m.displayName}</b>
          <button
            onClick={() => setMembers(members.filter((p) => p.uid !== m.uid))}
          >
            Remove
          </button>
        </div>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {group && (
        <button
          className="primary"
          disabled={busy || !name.trim()}
          onClick={async () => {
            setBusy(true);
            try {
              open(
                await createGroup(
                  name,
                  description,
                  members.map((m) => m.uid),
                ),
              );
              close();
            } catch (e) {
              setError(friendly(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Create group
        </button>
      )}
    </Modal>
  );
}
function Member({
  uid,
  chat,
  refresh,
  showProfile,
}: {
  uid: string;
  chat: Chat;
  refresh: () => void;
  showProfile: () => void;
}) {
  const { user } = useSession();
  const { data: p } = useQuery({
    queryKey: ["profile", uid],
    queryFn: () => getProfile(uid),
  });
  return (
    <div className="person-row">
      <button
        type="button"
        className="person-main"
        onClick={showProfile}
        aria-label={`View ${p?.displayName || "member"} profile`}
      >
        <Avatar profile={p} />
        <div>
          <b>{p?.displayName || "Deleted account"}</b>
          <small>
            {chat.admin === uid ? "Admin" : `@${p?.username || "unavailable"}`}
          </small>
        </div>
      </button>
      {chat.admin === user?.uid && uid !== user.uid && (
        <button
          onClick={() =>
            void changeMember(chat.id, uid, false)
              .then(refresh)
              .catch((e) => useSettings.getState().notify(friendly(e)))
          }
        >
          Remove
        </button>
      )}
    </div>
  );
}
export function GroupInfo({
  chat,
  close,
  blocked = [],
}: {
  chat: Chat;
  close: () => void;
  blocked?: string[];
}) {
  const { user } = useSession();
  const admin = chat.admin === user?.uid;
  const [name, setName] = useState(chat.name),
    [avatar, setAvatar] = useState(chat.avatar || "sage"),
    [description, setDescription] = useState(chat.description),
    [username, setUsername] = useState(""),
    [error, setError] = useState("");
  const [profileUid, setProfileUid] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      setError(friendly(e));
    }
  };
  if (profileUid)
    return (
      <ProfileView
        uid={profileUid}
        blocked={blocked.includes(profileUid)}
        close={() => setProfileUid("")}
      />
    );
  return (
    <Modal title="About this group" close={close}>
      <div className="profile-preview">
        <Avatar profile={{ avatar }} name={chat.name} />
        <p>
          {chat.members.length} people ·{" "}
          {chat.description || "A little space for your circle."}
        </p>
      </div>
      {admin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              await updateDoc(doc(db, "chats", chat.id), {
                name,
                avatar,
                description,
                updatedAt: serverTimestamp(),
              });
              useSettings.getState().notify("Group updated.");
            });
          }}
        >
          <label>
            Group name
            <input
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Description
            <textarea
              maxLength={240}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button className="secondary">Save details</button>
          <div className="palette">
            {["sage", "peach", "lavender", "sky", "sun", "rose"].map(
              (color) => (
                <button
                  type="button"
                  key={color}
                  className={`swatch ${color} ${avatar === color ? "selected" : ""}`}
                  aria-label={`${color} group avatar`}
                  aria-pressed={avatar === color}
                  onClick={() => setAvatar(color)}
                />
              ),
            )}
          </div>
        </form>
      )}
      <h3>Your circle</h3>
      {chat.members.map((uid) => (
        <Member
          key={uid}
          uid={uid}
          chat={chat}
          refresh={() => {}}
          showProfile={() => setProfileUid(uid)}
        />
      ))}
      {admin && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(async () => {
              const p = await findUser(username);
              await changeMember(chat.id, p.uid, true);
              setUsername("");
            });
          }}
        >
          <label>
            Add by username
            <div className="input-row">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <button className="secondary">Add</button>
            </div>
          </label>
        </form>
      )}
      {admin && chat.members.length > 1 && (
        <label>
          Transfer administration
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value)
                void run(() =>
                  updateDoc(doc(db, "chats", chat.id), {
                    admin: e.target.value,
                    updatedAt: serverTimestamp(),
                  }),
                );
            }}
          >
            <option value="" disabled>
              Select a member
            </option>
            {chat.members
              .filter((m) => m !== user?.uid)
              .map((m) => (
                <option value={m} key={m}>
                  {m}
                </option>
              ))}
          </select>
        </label>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="danger"
        disabled={admin && chat.members.length > 1}
        onClick={() =>
          void run(async () => {
            await changeMember(chat.id, user!.uid, false);
            close();
          })
        }
      >
        Leave group
      </button>
      {admin && chat.members.length > 1 && (
        <p className="muted">Transfer administration before leaving.</p>
      )}
    </Modal>
  );
}
export function Settings({
  close,
  edit,
  blocked,
}: {
  close: () => void;
  edit: () => void;
  blocked: string[];
}) {
  const s = useSettings(),
    { user } = useSession();
  const [deleting, setDeleting] = useState(false),
    [confirm, setConfirm] = useState("");
  return (
    <Modal title="Your space, your way" close={close}>
      <button className="settings-row" onClick={edit}>
        <span>Edit profile & privacy</span>
        <span>↗</span>
      </button>
      <label>
        Appearance
        <select
          value={s.theme}
          onChange={(e) => s.setTheme(e.target.value as typeof s.theme)}
        >
          <option value="system">Match my device</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </label>
      <h3>Notifications</h3>
      <label className="check">
        <input
          type="checkbox"
          checked={s.sound}
          onChange={(e) => s.setSound(e.target.checked)}
        />{" "}
        Play a sound for messages and incoming calls
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={s.notifications}
          onChange={async (e) => {
            if (e.target.checked) {
              if (!("Notification" in window)) {
                s.notify("This browser does not support notifications.");
                return;
              }
              try {
                const permission = await Notification.requestPermission();
                s.setNotifications(permission === "granted");
                if (permission !== "granted")
                  s.notify(
                    permission === "denied"
                      ? "Notifications are blocked. Allow them in this site’s browser settings."
                      : "Notification permission was not granted. You can try again.",
                  );
              } catch {
                s.setNotifications(false);
                s.notify("Notifications could not be enabled in this browser.");
              }
            } else s.setNotifications(false);
          }}
        />{" "}
        Notify me about messages and incoming calls
      </label>
      <p className="muted">
        Alerts work while Gather remains open, including in another tab. Closing
        or suspending the app can stop delivery. On iOS, install Gather on your
        Home Screen first. Message previews stay private in system
        notifications.
      </p>
      {s.notifications && (
        <button
          className="secondary"
          onClick={() =>
            void showBrowserNotification(
              "Gather · Notifications are ready",
              "Messages and incoming calls can alert you while Gather is open.",
              "/",
              "gather-test",
            ).then((shown) => {
              if (!shown)
                s.notify(
                  "Your browser could not display a notification. Check site permissions and device notification settings.",
                );
            })
          }
        >
          Send test notification
        </button>
      )}
      {!user?.emailVerified && (
        <button
          className="secondary"
          onClick={() =>
            void sendEmailVerification(user!)
              .then(() => s.notify("Verification email sent."))
              .catch((e) => s.notify(friendly(e)))
          }
        >
          Send email verification
        </button>
      )}
      <h3>Blocked accounts</h3>
      {blocked.length ? (
        blocked.map((uid) => <Blocked key={uid} uid={uid} />)
      ) : (
        <p className="muted">No blocked accounts.</p>
      )}
      <h3>Install Gather</h3>
      <button
        className="secondary"
        onClick={() => window.dispatchEvent(new Event("gather:install"))}
      >
        Install app / view instructions
      </button>
      <p className="muted">
        Use the install button when available, or your browser’s “Install app” /
        “Add to Home Screen” menu. HTTPS is required.
      </p>
      <button
        className="settings-row"
        onClick={() => void logout().catch((e) => s.notify(friendly(e)))}
      >
        <span>Sign out</span>
        <span>↗</span>
      </button>
      <details>
        <summary>Delete account</summary>
        <p>
          Your profile, username and credentials will be removed. Shared
          messages and call records remain attributed to a deleted account. This
          cannot be undone.
        </p>
        <label>
          Type DELETE
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        <button
          className="danger"
          disabled={confirm !== "DELETE" || deleting}
          onClick={async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              close();
            } catch (e) {
              s.notify(friendly(e));
            } finally {
              setDeleting(false);
            }
          }}
        >
          Permanently delete account
        </button>
      </details>
    </Modal>
  );
}
function Blocked({ uid }: { uid: string }) {
  const { data: p } = useQuery({
    queryKey: ["profile", uid],
    queryFn: () => getProfile(uid),
  });
  return (
    <div className="person-row">
      <Avatar profile={p} />
      <b>{p?.displayName || "Deleted account"}</b>
      <button
        onClick={() =>
          void block(uid, false).catch((e) =>
            useSettings.getState().notify(friendly(e)),
          )
        }
      >
        Unblock
      </button>
    </div>
  );
}
