import { Platform } from "react-native";

// Android emulator reaches the host machine via 10.0.2.2; for a physical device set
// DEVICE_HOST below to your computer's LAN IP (e.g. "192.168.1.20").
const DEVICE_HOST: string | null = null;

const DEFAULT_HOST = DEVICE_HOST ?? (Platform.OS === "android" ? "10.0.2.2" : "localhost");

export const API_BASE_URL = `http://${DEFAULT_HOST}:4000/api`;
