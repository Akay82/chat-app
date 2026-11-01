import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getProfile, block } from "./api";
import { Avatar, Modal } from "./components";
import { validAvatarPhoto } from "./avatar-photo";
import { useSession } from "./session";
import { friendly } from "./lib";
export function ProfileView({
  uid,
  blocked,
  close,
}: {
  uid: string;
  blocked: boolean;
  close: () => void;
}) {
  const { user } = useSession();
  const {
    data: person,
    isLoading,
    error,
    refetch,
  } = useQuery({ queryKey: ["profile", uid], queryFn: () => getProfile(uid) });
  const [large, setLarge] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  return (
    <Modal title="About this person" close={close}>
      {isLoading ? (
        <p role="status">Loading profile…</p>
      ) : error ? (
        <>
          <p role="alert" className="error">
            {friendly(error)}
          </p>
          <button className="secondary" onClick={() => void refetch()}>
            Retry profile
          </button>
        </>
      ) : !person ? (
        <p>This account is no longer available.</p>
      ) : (
        <>
          <div className="profile-preview">
            <button
              type="button"
              disabled={!validAvatarPhoto(person.photoURL)}
              aria-label={
                large ? "Shrink profile picture" : "Enlarge profile picture"
              }
              onClick={() => setLarge(!large)}
            >
              <Avatar profile={person} />
            </button>
            <div>
              <h3>{person.displayName}</h3>
              <p>@{person.username}</p>
            </div>
          </div>
          {large && validAvatarPhoto(person.photoURL) && (
            <img
              className="profile-photo-large"
              src={person.photoURL}
              alt={`${person.displayName}'s profile picture`}
            />
          )}
          <p className="profile-bio">
            {person.bio || "A little mystery is a good thing."}
          </p>
          {uid !== user?.uid && (
            <>
              <button
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setFailure("");
                  try {
                    await block(uid, !blocked);
                  } catch (error) {
                    setFailure(friendly(error));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? "Updating…"
                  : blocked
                    ? "Unblock this person"
                    : "Block this person"}
              </button>
              <p className="muted">
                Blocking stops direct messages and calls. Shared groups remain
                visible.
              </p>
            </>
          )}
          {failure && (
            <p role="alert" className="error">
              {failure}
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
