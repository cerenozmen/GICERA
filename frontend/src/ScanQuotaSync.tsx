import { useEffect } from "react";
import { useApp } from "./AppContext";
import { useAuth } from "./AuthContext";
import { reconcileScans } from "./subscription";

/**
 * Keeps the used free barcode reads with the signed-in account (renders nothing). The phone counts the
 * reads (AppContext); once signed in, the higher of the phone's and the account's count wins on both
 * sides. Without an account the count simply stays on the phone.
 */
export function ScanQuotaSync() {
  const { ready: appReady, scansUsed: used, syncScansUsed } = useApp();
  const { ready: authReady, user, saveScansUsed } = useAuth();
  const remote = user?.scansUsed;
  const signedIn = !!user;

  useEffect(() => {
    if (!appReady || !authReady || !signedIn) return;
    const next = reconcileScans(used, remote);
    if (next.local > used) syncScansUsed(next.local);
    if (next.upload) saveScansUsed(next.local).catch(() => {});
  }, [appReady, authReady, signedIn, used, remote, syncScansUsed, saveScansUsed]);

  return null;
}
