export function pushWorkspaceNotification({ id, title, body, route }) {
  if (!id) return null;
  const item = {
    id: String(id),
    title: title || "Notification",
    body: body || "",
    route: route || "/tasks",
    createdAt: new Date().toISOString(),
  };
  window.__collabflowNotifications = [
    item,
    ...(window.__collabflowNotifications || []).filter((existing) => existing.id !== item.id),
  ].slice(0, 50);
  window.dispatchEvent(
    new CustomEvent("collabflow:notification-added", {
      detail: item,
    })
  );
  return item;
}

export function isViewingTask(taskId) {
  if (taskId == null || typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  const openId = params.get("task");
  return (
    window.location.pathname.startsWith("/tasks") &&
    String(openId || "") === String(taskId)
  );
}

export function taskDesktopRoute(taskId) {
  return taskId != null ? `/tasks?task=${taskId}` : "/tasks";
}
