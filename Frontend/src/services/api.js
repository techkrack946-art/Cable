import axios from "axios";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

const api = axios.create({
  baseURL: `${apiBaseUrl}/api`,
});

export async function getCustomers() {
  const response = await api.get("/customers");
  return response.data.customers;
}

export async function getCustomer(id) {
  const response = await api.get(`/customers/${id}`);
  return response.data.customer;
}

export async function createCustomer(data) {
  const response = await api.post("/customers", data);
  return response.data.customer;
}

export async function updateCustomer(id, data) {
  const response = await api.put(`/customers/${id}`, data);
  return response.data.customer;
}

export async function deleteCustomer(id) {
  const response = await api.delete(`/customers/${id}`);
  return response.data.customer;
}

export async function rechargeCustomer(id, data) {
  const response = await api.post(`/customers/${id}/recharge`, data);
  return response.data.customer;
}

export async function sendCustomerSms(id, message) {
  try {
    const response = await api.post(`/sms/customers/${encodeURIComponent(id)}/manual`, { message });
    return response.data;
  } catch (error) {
    const failure = error.response?.data;
    const providerStatus = failure?.providerStatus;
    const message = failure?.message || "Unable to send SMS.";
    const detail = providerStatus ? ` (HTTP ${providerStatus})` : "";
    throw new Error(`${message}${detail}`);
  }
}

export async function getExpiryDashboard() {
  const response = await api.get("/dashboard/expiry");
  return response.data;
}

export async function getSettings() {
  const response = await api.get("/settings");
  return response.data;
}

export async function updateSettings(data) {
  const response = await api.put("/settings", data);
  return response.data;
}
