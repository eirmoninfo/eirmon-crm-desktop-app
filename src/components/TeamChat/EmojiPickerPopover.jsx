import { useEffect, useRef } from "react";
import EmojiPicker, {
  Categories,
  EmojiStyle,
  SkinTonePickerLocation,
  SuggestionMode,
  Theme,
} from "emoji-picker-react";
import { FaTimes } from "react-icons/fa";

/* eslint-disable react-refresh/only-export-components -- storage helpers are colocated with the reusable picker */

const CATEGORY_CONFIG = [
  { category: Categories.SUGGESTED, name: "Recently used" },
  { category: Categories.SMILEYS_PEOPLE, name: "Smileys & people" },
  { category: Categories.ANIMALS_NATURE, name: "Animals & nature" },
  { category: Categories.FOOD_DRINK, name: "Food & drink" },
  { category: Categories.ACTIVITIES, name: "Activities" },
  { category: Categories.TRAVEL_PLACES, name: "Travel & places" },
  { category: Categories.OBJECTS, name: "Objects" },
  { category: Categories.SYMBOLS, name: "Symbols" },
  { category: Categories.FLAGS, name: "Flags" },
];

const DEFAULT_RECENT = ["👍", "❤️", "😂", "🎉", "🙏", "🔥", "👏", "😊"];

function recentKey(userId) {
  return `eirmon:team-chat:recent-emojis:${userId ?? "anonymous"}`;
}

export function rememberRecentEmoji(userId, emoji) {
  try {
    const key = recentKey(userId);
    const stored = JSON.parse(localStorage.getItem(key) || "[]");
    const previous = Array.isArray(stored) ? stored : [];
    const existing = previous.find((item) => item.emoji === emoji);
    const next = [
      { emoji, count: (existing?.count || 0) + 1, usedAt: Date.now() },
      ...previous.filter((item) => item.emoji !== emoji),
    ]
      .sort((a, b) => b.count - a.count || b.usedAt - a.usedAt)
      .slice(0, 36);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Emoji selection must still work when storage is unavailable.
  }
}

export function getRecentEmojis(userId) {
  try {
    const stored = JSON.parse(localStorage.getItem(recentKey(userId)) || "[]");
    if (Array.isArray(stored) && stored.length) {
      return stored.slice(0, 36).map((item) => item.emoji);
    }
  } catch {
    // Fall through to useful defaults.
  }
  return DEFAULT_RECENT;
}

export default function EmojiPickerPopover({
  open,
  onClose,
  onSelect,
  userId,
  title = "Choose an emoji",
  className = "",
}) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!panelRef.current?.contains(event.target)) onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      className={`team-chat-emoji-popover ${className}`}
      role="dialog"
      aria-label={title}
    >
      <div className="team-chat-emoji-heading">
        <p>{title}</p>
        <button type="button" onClick={onClose} aria-label="Close emoji picker">
          <FaTimes aria-hidden="true" />
        </button>
      </div>
      <div className="team-chat-emoji-recent" aria-label="Your frequently used emojis">
        {getRecentEmojis(userId).slice(0, 8).map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              rememberRecentEmoji(userId, emoji);
              onSelect(emoji);
            }}
            title={`Insert ${emoji}`}
            aria-label={`Insert ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <EmojiPicker
        width="100%"
        height="min(420px, 58vh)"
        theme={Theme.AUTO}
        emojiStyle={EmojiStyle.NATIVE}
        categories={CATEGORY_CONFIG}
        suggestedEmojisMode={SuggestionMode.FREQUENT}
        skinTonePickerLocation={SkinTonePickerLocation.SEARCH}
        searchPlaceHolder="Search emojis"
        previewConfig={{ showPreview: true, defaultCaption: "Pick an emoji" }}
        lazyLoadEmojis
        onEmojiClick={(data) => {
          rememberRecentEmoji(userId, data.emoji);
          onSelect(data.emoji, data);
        }}
      />
    </div>
  );
}
