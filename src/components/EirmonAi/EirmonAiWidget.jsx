import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { FaComments, FaTimes, FaExpand } from "react-icons/fa";
import { getToken } from "../../utils/storage";
import EirmonLogo from "../EirmonLogo";
import { EIRMON_AI_NAME } from "../../utils/eirmonAiBrand";
import { useEirmonAiChat } from "../../hooks/useEirmonAiChat";
import EirmonAiChatPanel from "./EirmonAiChatPanel";
import { P } from "../../constants/permissions";
import { canAccessAny, isSuperAdminUser } from "../../utils/permissions";

function readUser() {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readUserName() {
  const u = readUser();
  return u?.user?.name ?? u?.name ?? "";
}

export default function EirmonAiWidget() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [userName, setUserName] = useState(readUserName);
  const [allowed, setAllowed] = useState(false);
  const chat = useEirmonAiChat({ userName });

  const isFullPage = location.pathname.startsWith("/eirmon-ai");
  const loggedIn = Boolean(getToken());

  useEffect(() => {
    setUserName(readUserName());
    const user = readUser();
    setAllowed(
      isSuperAdminUser(user) ||
        canAccessAny(user, [P.USE_EIRMON_AI, P.USE_AI_MARKETING_ASSISTANT])
    );
  }, [location.pathname]);

  if (!loggedIn || isFullPage || !allowed) return null;

  return (
    <>
      {!open ? (
        <motion.button
          type="button"
          onClick={() => setOpen(true)}
          className="eirmon-ai-fab fixed bottom-6 right-6 z-[60] flex h-14 w-14 items-center justify-center rounded-full border border-[#0a84ff]/35 bg-gradient-to-br from-[#0a84ff]/95 to-[#5e5ce6]/95 text-white shadow-[0_0_40px_rgb(10_132_255_/_0.45)] backdrop-blur-xl"
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.96 }}
          aria-label={`Open ${EIRMON_AI_NAME}`}
          title={EIRMON_AI_NAME}
        >
          <EirmonLogo
            size={40}
            className="!rounded-full ring-2 ring-white/25"
            aria-label={EIRMON_AI_NAME}
          />
          <span className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-tr from-white/20 to-transparent" />
        </motion.button>
      ) : null}

      {open ? (
        <div className="fixed bottom-6 right-6 z-[70] flex h-[min(640px,calc(100vh-3rem))] w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0a0a0a]/85 shadow-2xl backdrop-blur-2xl">
          <div className="flex items-center justify-end gap-1 border-b border-white/10 bg-white/5 px-2 py-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate("/eirmon-ai");
              }}
              className="rounded-lg p-2 text-glass-muted hover:bg-white/10 hover:text-white"
              aria-label="Open full page"
              title="Open full page"
            >
              <FaExpand className="text-sm" />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-2 text-glass-muted hover:bg-white/10 hover:text-white"
              aria-label="Close assistant"
            >
              <FaTimes className="text-sm" />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <EirmonAiChatPanel chat={chat} compact onClose={() => setOpen(false)} />
          </div>
        </div>
      ) : null}

      {!open ? (
        <span className="sr-only">
          <FaComments aria-hidden />
        </span>
      ) : null}
    </>
  );
}
