/** In-app help topics Eirmon AI can explain and link to. */
export const EIRMON_AI_FEATURES = [
  {
    id: "attendance",
    title: "Attendance & punch",
    icon: "🕐",
    route: "/home",
    keywords: [
      "punch",
      "check in",
      "check out",
      "checkout",
      "checkin",
      "clock in",
      "clock out",
      "attendance",
      "working hours",
    ],
    summary: "Punch in/out, breaks, and workday tracking.",
    answer: `**Attendance & punch**

• **Punch in** — open **Dashboard** and tap **Punch in** to start your workday.
• **Break** — use **Start break** / **End break** while punched in.
• **Check out** — tap **Check out** on the Dashboard when you finish.
• **Attendance page** — view your monthly records and manage breaks (no punch buttons there).
• **Auto punch out** — if you close the desktop app while punched in, you'll get a warning and can be punched out automatically.

Go to **Dashboard** to punch in or out now.`,
  },
  {
    id: "tasks",
    title: "Tasks & board",
    icon: "✅",
    route: "/tasks",
    keywords: [
      "task",
      "tasks",
      "board",
      "kanban",
      "todo",
      "in progress",
      "review",
      "blocked",
      "completed",
      "assign",
      "priority",
      "due date",
    ],
    summary: "Kanban board, drag-and-drop, and task details.",
    answer: `**Tasks**

• Open **Tasks** from the sidebar for list or board view.
• **Board columns:** Todo → Pending → In Progress → Review → Blocked → Completed.
• **Drag cards** between columns to update status.
• Click a card to open details — edit title, priority, due date, subtasks, comments, and attachments.
• Use filters: My tasks, Overdue, assignee, priority, and due date.
• **+ New task** creates a task from the admin flow.

Open **Tasks** to manage your work.`,
  },
  {
    id: "expenses",
    title: "Expenses & budgets",
    icon: "💰",
    route: "/expense",
    keywords: [
      "expense",
      "expenses",
      "budget",
      "budgets",
      "receipt",
      "reimburse",
      "category",
      "approve",
    ],
    summary: "Submit expenses, budgets, and categories.",
    answer: `**Expenses & budgets**

• **Expenses** — create and track claims under Expense Management → Expenses.
• **Categories** — organize expense types under Expense Categories.
• **Budgets** — view and manage budgets if you have access.
• Approvers can review and approve expenses from the expense list.

Open **Expenses** to submit or review claims.`,
  },
  {
    id: "team-chat",
    title: "Team chat",
    icon: "💬",
    route: "/team-chat",
    keywords: [
      "chat",
      "message",
      "channel",
      "dm",
      "direct",
      "team chat",
      "conversation",
    ],
    summary: "Channels, DMs, and file sharing.",
    answer: `**Team chat**

• Open **Team chat** from the sidebar.
• Join **channels** or start a **direct message** with a teammate.
• Send text and **attach files** in conversations.
• Unread badges show on channels with new messages.
• Create a new channel with **+** when you need a team space.

Open **Team chat** to message your team.`,
  },
  {
    id: "leave",
    title: "Leave requests",
    icon: "📅",
    route: "/leave-requests",
    keywords: ["leave", "holiday", "vacation", "time off", "pto", "sick"],
    summary: "Request and track leave.",
    answer: `**Leave requests**

• Open **Leave** from the sidebar to submit and track leave requests.
• Check status of pending and approved leave from the same page.

Open **Leave** to request time off.`,
  },
  {
    id: "notes",
    title: "Workspace notes",
    icon: "📝",
    route: "/rough-work",
    keywords: ["note", "notes", "notepad", "rough work", "workspace notes"],
    summary: "Quick notes and drafts.",
    answer: `**Workspace notes**

• **Workspace Notes** is your personal notepad inside Eirmon CRM.
• Save drafts, rough ideas, and quick reminders while you work.

Open **Workspace Notes** to write.`,
  },
  {
    id: "desktop",
    title: "Desktop app tips",
    icon: "🖥️",
    route: "/home",
    keywords: [
      "desktop",
      "electron",
      "update",
      "screenshot",
      "idle",
      "notification",
      "close app",
      "quit",
    ],
    summary: "Updates, screenshots, idle tracking, and notifications.",
    answer: `**Desktop app tips**

• **Auto punch out** — closing the app while punched in shows a warning; confirming punches you out.
• **Screenshots** — captured while you're punched in (per company tracker settings).
• **Idle monitoring** — long idle time may trigger break handling per your org policy.
• **Motivation notifications** — check-in may trigger encouraging messages.
• **App updates** — packaged builds check for updates automatically; use **Check for updates** on the Dashboard.
• **Team chat & tasks** work the same as in the browser, optimized for desktop.

Need help with something specific? Ask me!`,
  },
];

export const EIRMON_AI_QUICK_PROMPTS = [
  "Check me in",
  "Show my attendance for today",
  "Show my tasks",
  "What happens when I close the app?",
  "Show this month's attendance report",
];

export const ROUTE_HINTS = {
  "/home": "You're on the Dashboard — punch in/out and see today's summary here.",
  "/attendance": "You're on Attendance — view records and manage breaks here.",
  "/tasks": "You're on Tasks — use the board or list to manage work.",
  "/team-chat": "You're on Team chat — message channels or teammates.",
  "/leave-requests": "You're on Leave — submit or track leave here.",
  "/expense": "You're on Expenses — create or review expense claims.",
  "/budgets": "You're on Budgets — manage budget allocations.",
  "/rough-work": "You're on Workspace Notes — jot down ideas here.",
  "/eirmon-ai": "You're chatting with Eirmon AI — ask anything about the app!",
};
