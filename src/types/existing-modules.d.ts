declare module '@/utils/appBrand' {
  export function getToastLogoIcon(): JSX.Element;
}

declare module '@/utils/workspaceNotifications' {
  export function pushWorkspaceNotification(payload: {
    id: string;
    title: string;
    body: string;
    route: string;
  }): { id: string; title: string; body: string; route: string; createdAt: string } | null;
  export function isViewingTask(taskId: string | number | null | undefined): boolean;
  export function taskDesktopRoute(taskId: string | number | null | undefined): string;
}

declare module '@/utils/appNotification' {
  export function showAppNotification(payload: {
    title?: string;
    body?: string;
    route?: string;
    actions?: Array<{ id: string; text: string }>;
    toastMessage?: string;
    toastOptions?: Record<string, unknown>;
  }): Promise<{ ok: boolean; icon?: string | null; error?: string; reason?: string }>;
}

declare module '@/api/teamChat.api' {
  export function createTeamChatChannel(payload: Record<string, unknown>): Promise<unknown>;
  export function forwardTeamChatMessage(message: unknown, channelId: string | number): Promise<unknown>;
  export function listTeamChatMessages(channelId: string | number, options?: Record<string, unknown>): Promise<unknown>;
  export function markTeamChatChannelRead(channelId: string | number): Promise<unknown>;
  export function searchTeamChat(query: string): Promise<unknown>;
  export function sendTeamChatMessage(channelId: string | number, payload: { body: string; file?: File; replyToId?: string | number }): Promise<unknown>;
  export function startTeamChatCall(channelId: string | number, mode?: 'audio' | 'video'): Promise<unknown>;
  export function startTeamChatDirect(userId: string | number): Promise<unknown>;
  export function teamChatBootstrap(): Promise<unknown>;
  export function toggleTeamChatMessageReaction(messageId: string | number, emoji: string): Promise<unknown>;
}

declare module '@/utils/teamChatHelpers' {
  export function channelLabel(channel: Record<string, unknown>, usersById: Map<string | number, Record<string, unknown>>): string;
  export function extractChatMessage(payload: unknown): unknown;
  export function getStoredUserId(): string | number | null;
  export function groupMessagesByDate(messages: unknown[]): unknown[];
  export function isDirectChannel(channel: Record<string, unknown>): boolean;
  export function mergeMessagesById(existing: unknown[], incoming: unknown[]): unknown[];
  export function messagePreview(message: Record<string, unknown>): string;
  export function normalizeMessage(message: Record<string, unknown>): Record<string, unknown>;
  export function parseBootstrap(response: unknown): { channels: unknown[]; users: unknown[] };
  export function parseChannel(response: unknown): Record<string, unknown> | null;
  export function parseMessages(response: unknown): unknown[];
  export function sortMessagesChronologically(messages: unknown[]): unknown[];
}

declare module '@/utils/teamChatEcho' {
  export function leaveTeamChatChannel(): void;
  export function leaveTeamChatGlobalChannels(): void;
  export function leaveTeamChatUser(): void;
  export function subscribeTeamChatChannel(channelId: string | number, callbacks: Record<string, unknown>): boolean;
  export function subscribeTeamChatGlobalChannels(channelIds: (string | number)[], callbacks: Record<string, unknown>): void;
  export function subscribeTeamChatUser(userId: string | number, callbacks: Record<string, unknown>): void;
}

declare module '@electron/electronBootstrap' {
  export function bootstrapElectron(token: string): Promise<void>;
  export function resetTrackerBootstrap(): void;
}

declare module '@/utils/punchOutOnAppClose' {
  export function startPunchOutOnAppClose(): (() => void) | void;
}

declare module '@/features/meetings/components/IncomingCallOverlay' {
  const IncomingCallOverlay: React.FC;
  export default IncomingCallOverlay;
}

declare module '@/components/EirmonAi/EirmonAiWidget' {
  const EirmonAiWidget: React.FC;
  export default EirmonAiWidget;
}

declare module '@/pages/Login' {
  const Login: React.FC;
  export default Login;
}

declare module '@/pages/Home' {
  const Home: React.FC;
  export default Home;
}

declare module '@/pages/AttendanceDashboard' {
  const AttendanceDashboard: React.FC;
  export default AttendanceDashboard;
}

declare module '@/pages/Budgetsindex' {
  const Budgetsindex: React.FC;
  export default Budgetsindex;
}

declare module '@/pages/BudgetForm' {
  const BudgetForm: React.FC;
  export default BudgetForm;
}

declare module '@/pages/Expensesindex' {
  const Expensesindex: React.FC;
  export default Expensesindex;
}

declare module '@/pages/ExpenseCreate' {
  const ExpenseCreate: React.FC;
  export default ExpenseCreate;
}

declare module '@/pages/ExpenseDetail' {
  const ExpenseDetail: React.FC;
  export default ExpenseDetail;
}

declare module '@/pages/ExpenseCategories' {
  const ExpenseCategories: React.FC;
  export default ExpenseCategories;
}

declare module '@/pages/ExpenseCategoryCreate' {
  const ExpenseCategoryCreate: React.FC;
  export default ExpenseCategoryCreate;
}

declare module '@/pages/RoughWorkNotepad' {
  const RoughWorkNotepad: React.FC;
  export default RoughWorkNotepad;
}

declare module '@/pages/TaskManagement' {
  const TaskManagement: React.FC;
  export default TaskManagement;
}

declare module '@/pages/TaskCreate' {
  const TaskCreate: React.FC;
  export default TaskCreate;
}

declare module '@/pages/LeaveRequests' {
  const LeaveRequests: React.FC;
  export default LeaveRequests;
}

declare module '@/pages/TeamChat' {
  const TeamChat: React.FC;
  export default TeamChat;
}

declare module '@/pages/EirmonAi' {
  const EirmonAi: React.FC;
  export default EirmonAi;
}

declare module '@/features/meetings/pages/MeetingsPage' {
  const MeetingsPage: React.FC;
  export default MeetingsPage;
}

declare module '@/features/meetings/pages/CreateMeetingPage' {
  const CreateMeetingPage: React.FC;
  export default CreateMeetingPage;
}

declare module '@/features/meetings/pages/MeetingRoomPage' {
  const MeetingRoomPage: React.FC;
  export default MeetingRoomPage;
}

declare module '@/pages/Unauthorized' {
  const Unauthorized: React.FC;
  export default Unauthorized;
}

declare module '@/components/glass/Glass' {
  export function GlassPanel(props: React.HTMLAttributes<HTMLDivElement>): JSX.Element;
  export function GlassCard(props: React.HTMLAttributes<HTMLDivElement> & { children: React.ReactNode }): JSX.Element;
  export function GlassButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' }): JSX.Element;
  export function GlassInput(props: React.InputHTMLAttributes<HTMLInputElement> & { label?: string }): JSX.Element;
  export function GlassPill(props: React.HTMLAttributes<HTMLSpanElement> & { active?: boolean }): JSX.Element;
  export function PageHeader(props: { title: string; subtitle?: string; actions?: React.ReactNode }): JSX.Element;
  export function LoadingScreen(props: { label?: string }): JSX.Element;
}