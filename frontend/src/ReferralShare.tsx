import { useEffect, useState } from "react";
import { ArrowRight, Check, Copy, Download, Lock, MessageCircle, QrCode, Send, Share2, X } from "lucide-react";
import QRCode from "qrcode";
import type { Address } from "viem";

const message = "Join my team on Open Protocol";

export function referralLink(address: Address) {
  return `${location.origin}${location.pathname}?ref=${address}`;
}

/** Referral link card for connected members: copy, WhatsApp, Telegram, QR code and native share. */
export function ReferralShare({ address, memberId }: { address: Address; memberId?: bigint }) {
  const link = referralLink(address);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qr, setQr] = useState<string>();

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(link, { width: 480, margin: 2, errorCorrectionLevel: "M", color: { dark: "#03050c", light: "#ffffff" } })
      .then(url => { if (live) setQr(url); })
      .catch(() => { if (live) setQr(undefined); });
    return () => { live = false; };
  }, [link]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(link); }
    catch {
      const field = document.createElement("textarea");
      field.value = link; document.body.appendChild(field); field.select();
      document.execCommand("copy"); field.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const nativeShare = async () => {
    try { await navigator.share({ title: "Open Protocol", text: message, url: link }); } catch { /* dismissed */ }
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return <section className="ref-share">
    <div className="wrap-wide">
      <div className="ref-share-card">
        <div className="ref-share-copy">
          <small>YOUR REFERRAL LINK{memberId ? ` · MEMBER #${memberId.toString()}` : ""}</small>
          <h2>Invite friends to your team.</h2>
          <p>Everyone who registers through your link becomes your direct referral, recorded on-chain permanently.</p>
          <div className="ref-share-link">
            <code title={link}>{link}</code>
            <button onClick={copy}>{copied ? <><Check size={14}/> Copied</> : <><Copy size={14}/> Copy</>}</button>
          </div>
          <div className="ref-share-actions">
            <a className="wa" href={`https://wa.me/?text=${encodeURIComponent(`${message}: ${link}`)}`} target="_blank" rel="noreferrer"><MessageCircle size={15}/> WhatsApp</a>
            <a className="tg" href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><Send size={15}/> Telegram</a>
            <button className={showQr ? "active" : ""} onClick={() => setShowQr(v => !v)} aria-expanded={showQr}><QrCode size={15}/> QR code</button>
            <button onClick={copy}>{copied ? <Check size={15}/> : <Copy size={15}/>} Copy link</button>
            {canShare && <button onClick={nativeShare}><Share2 size={15}/> More</button>}
          </div>
        </div>
        <div className={`ref-share-qr ${showQr ? "open" : ""}`}>
          {showQr && <button className="ref-qr-close" onClick={() => setShowQr(false)} aria-label="Hide QR code"><X size={14}/></button>}
          {qr ? <img src={qr} alt="QR code for your referral link"/> : <div className="ref-qr-placeholder"><QrCode size={42}/></div>}
          <p>Scan to join with your link</p>
          {qr && <a className="ref-qr-download" href={qr} download="open-protocol-referral-qr.png"><Download size={13}/> Download QR</a>}
        </div>
      </div>
    </div>
  </section>;
}

/** Shown to visitors who aren't registered: the referral tools are locked until they join. */
export function ReferralJoinPrompt({ connected, onJoin }: { connected: boolean; onJoin: () => void }) {
  return <section className="ref-share">
    <div className="wrap-wide">
      <div className="ref-share-card locked">
        <div className="ref-share-copy">
          <small><Lock size={11}/> REFERRAL LINK LOCKED</small>
          <h2>Join to get your referral link.</h2>
          <p>{connected
            ? "This wallet isn't registered yet. Register once and you'll get a personal link to share on WhatsApp, Telegram or by QR code. Everyone who joins through it becomes your direct referral."
            : "Connect your wallet and register to unlock a personal link you can share on WhatsApp, Telegram or by QR code. Everyone who joins through it becomes your direct referral."}</p>
          <div className="ref-share-link" aria-hidden="true">
            <code className="ref-blur">{location.origin}/?ref=0x••••••••••••••••••••••••••••••••••••••••</code>
            <button onClick={onJoin} tabIndex={-1}><Lock size={14}/> Locked</button>
          </div>
          <div className="ref-share-actions">
            <button className="ref-join" onClick={onJoin}>{connected ? "Join now to unlock" : "Join to unlock"} <ArrowRight size={15}/></button>
            <span className="ref-locked-chip"><MessageCircle size={14}/> WhatsApp</span>
            <span className="ref-locked-chip"><Send size={14}/> Telegram</span>
            <span className="ref-locked-chip"><QrCode size={14}/> QR code</span>
            <span className="ref-locked-chip"><Copy size={14}/> Copy link</span>
          </div>
        </div>
        <div className="ref-share-qr ref-qr-locked">
          <div className="ref-qr-placeholder"><QrCode size={42}/><span><Lock size={18}/></span></div>
          <p>Your QR code appears after you join</p>
        </div>
      </div>
    </div>
  </section>;
}
