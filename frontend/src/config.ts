import { Platform } from "react-native";

// Android emulator reaches the host machine via 10.0.2.2; for a physical device set
// DEVICE_HOST below to your computer's LAN IP (e.g. "192.168.1.20"). Keep this as a
// local-only edit — don't commit your personal IP, it won't work on anyone else's network.
const DEVICE_HOST: string | null = null;

const DEFAULT_HOST = DEVICE_HOST ?? (Platform.OS === "android" ? "10.0.2.2" : "localhost");

// "Google ile devam et": the *Web* OAuth client ID from Google Cloud Console (APIs & Services > Credentials),
// the same one enabled under Supabase > Authentication > Providers > Google. Also needs an Android OAuth
// client for package com.gicera with your signing key's SHA-1. While null the button explains it isn't set up.
export const GOOGLE_WEB_CLIENT_ID: string | null = null;

export const API_BASE_URL = `http://${DEFAULT_HOST}:4000/api`;
