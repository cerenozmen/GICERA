import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { lookupBarcode } from "./src/api";
import { ResultScreen } from "./src/screens/ResultScreen";
import { ScannerScreen } from "./src/screens/ScannerScreen";
import { LookupResult } from "./src/types";

export default function App() {
  const [result, setResult] = useState<LookupResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleScanned(barcode: string) {
    setBusy(true);
    setError(null);
    try {
      setResult(await lookupBarcode(barcode));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bağlantı hatası");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {result ? (
        <ResultScreen result={result} onBack={() => setResult(null)} />
      ) : (
        <ScannerScreen busy={busy} error={error} onScanned={handleScanned} />
      )}
      <StatusBar style="auto" />
    </>
  );
}
