import { apiRequest } from "./http";
import { saveToken } from "../utils/storage";
import { getToken } from "../utils/storage";
// src/services/auth.js  (or wherever your api functions live)

export async function login(data) {
  const response = await apiRequest("/login", {
    method: "POST",
    body: JSON.stringify(data),
  });

  



  saveToken(response.token);
  if (response.user) {
    localStorage.setItem("user", JSON.stringify(response.user));
  }
  return response;
}

// src/services/auth.js or wherever you keep API calls



export async function getCurrentUser() {
  const token = getToken(); // e.g., localStorage.getItem("token")

  if (!token) {
    return { success: false, error: "No token found. Please login again." };
  }

  try {
    const response = await apiRequest("/me", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,  // ← THIS IS CRUCIAL FOR SANCTUM
        // 'Content-Type' not needed for GET
      },
    });

    localStorage.setItem('user', JSON.stringify(response.user));
    return { success: true, data: response };
  } catch (error) {
    console.error("Failed to fetch user:", error);

    // Common cases: 401 means invalid/expired token
    if (error.status === 401) {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    }

    return {
      success: false,
      error: error.message || "Failed to fetch user data. Please login again.",
    };
  }
}