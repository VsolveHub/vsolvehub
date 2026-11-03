// scripts/qa/fix-partner-lint.mjs
import fs from "fs";
import path from "path";

const rootDir = process.cwd();

// 1. partner/app/index.tsx
{
  const p = path.resolve(rootDir, "frontend/mobile/apps/partner/app/index.tsx");
  let s = fs.readFileSync(p, "utf-8");
  s = s.replace(">Today's Earnings<", ">Today&apos;s Earnings<");
  fs.writeFileSync(p, s, "utf-8");
  console.log("Fixed Today's Earnings in partner index.tsx");
}

// 2. dispatch-offer-screen.tsx
{
  const p = path.resolve(rootDir, "frontend/mobile/apps/partner/src/features/dispatch/view/dispatch-offer-screen.tsx");
  let s = fs.readFileSync(p, "utf-8");
  s = s.replace("type DispatchOfferData,\n", "");
  s = s.replace("type DispatchOfferData,\r\n", "");

  const oldCode = `  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const initialSecondsRef = useRef<number>(60);
  const baselineClientTimeRef = useRef<number>(Date.now());
  const baselineServerRemainingRef = useRef<number>(0);

  const offer = offerQuery.data;

  // Initialize and calibrate timer against server timestamps
  useEffect(() => {
    if (!offer) return;

    let remaining = offer.remaining_seconds;
    if (offer.expires_at && offer.server_now) {
      const serverNow = new Date(offer.server_now).getTime();
      const expiresAt = new Date(offer.expires_at).getTime();
      if (!isNaN(serverNow) && !isNaN(expiresAt)) {
        remaining = Math.max(0, Math.floor((expiresAt - serverNow) / 1000));
      }
    }

    baselineClientTimeRef.current = Date.now();
    baselineServerRemainingRef.current = remaining;
    if (remaining > initialSecondsRef.current) {
      initialSecondsRef.current = remaining;
    }
    setSecondsRemaining(remaining);

    if (offer.status === "EXPIRED" || remaining <= 0) {
      setActionResult({
        type: "expired",
        message: t("work.dispatch.expired"),
      });
    } else if (offer.status === "ACCEPTED") {
      setActionResult({
        type: "success",
        message: t("work.dispatch.alreadyAccepted"),
      });
    } else if (offer.status === "DECLINED") {
      setActionResult({
        type: "declined",
        message: t("work.dispatch.declined"),
      });
    }
  }, [offer, t]);`;

  const newCode = `  const [secondsRemaining, setSecondsRemaining] = useState<number>(0);
  const [initialSeconds, setInitialSeconds] = useState<number>(60);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const baselineClientTimeRef = useRef<number>(0);
  const baselineServerRemainingRef = useRef<number>(0);

  const offer = offerQuery.data;

  const [prevOffer, setPrevOffer] = useState(offer);
  if (offer && offer !== prevOffer) {
    setPrevOffer(offer);
    let remaining = offer.remaining_seconds;
    if (offer.expires_at && offer.server_now) {
      const serverNow = new Date(offer.server_now).getTime();
      const expiresAt = new Date(offer.expires_at).getTime();
      if (!isNaN(serverNow) && !isNaN(expiresAt)) {
        remaining = Math.max(0, Math.floor((expiresAt - serverNow) / 1000));
      }
    }

    baselineClientTimeRef.current = Date.now();
    baselineServerRemainingRef.current = remaining;
    if (remaining > initialSeconds) {
      setInitialSeconds(remaining);
    }
    setSecondsRemaining(remaining);

    if (offer.status === "EXPIRED" || remaining <= 0) {
      setActionResult({
        type: "expired",
        message: t("work.dispatch.expired"),
      });
    } else if (offer.status === "ACCEPTED") {
      setActionResult({
        type: "success",
        message: t("work.dispatch.alreadyAccepted"),
      });
    } else if (offer.status === "DECLINED") {
      setActionResult({
        type: "declined",
        message: t("work.dispatch.declined"),
      });
    }
  }`;

  s = s.replace(oldCode.replace(/\r?\n/g, "\r\n"), newCode.replace(/\n/g, "\r\n"));
  s = s.replace(oldCode.replace(/\r?\n/g, "\n"), newCode.replace(/\r?\n/g, "\n"));
  s = s.replace(
    "const totalSeconds = Math.max(initialSecondsRef.current, 60);",
    "const totalSeconds = Math.max(initialSeconds, 60);"
  );

  fs.writeFileSync(p, s, "utf-8");
  console.log("Fixed dispatch-offer-screen.tsx lint issues");
}

