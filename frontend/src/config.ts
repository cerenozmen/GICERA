import { Platform } from "react-native";

// Android emulator reaches the host machine via 10.0.2.2; override for a physical device.
const DEFAULT_HOST = Platform.OS === "android" ? "10.0.2.2" : "localhost";

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? `http://${DEFAULT_HOST}:4000/api`;
