import { motion } from "framer-motion";
import { ArrowRight, Award, Check, ChevronRight, Crown, ExternalLink, Eye, GitBranch, Layers, Lock, Network, RefreshCw, ShieldCheck, Sparkles, Trophy, UserPlus, Users, Wallet, WalletCards, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { explorerUrl, protocolAddress } from "./config";
import { incomeStreams } from "./income";
import { formatToken } from "./utils/format";
import { ReferralJoinPrompt, ReferralShare } from "./ReferralShare";
import type { Address } from "viem";

const streamIcons: Record<string, LucideIcon> = {
  DIRECT_INCOME: UserPlus,
  TEN_LEVEL_UPLINE: Layers,
  MATRIX_INCOME: GitBranch,
  NONWORKING_U1: Users,
  NONWORKING_UPLINE: Network,
  REENTRY: RefreshCw,
  WEEKLY_SUPERSTAR: Trophy,
  POOL_LEVEL_INCOME: Award,
  FIVE_STAR_ROYALTY: Crown,
};

const split = [
  { name: "Working pool", value: 15, tone: "blue", note: "Direct and ten-level upline income" },
  { name: "Non-working pool", value: 9, tone: "green", note: "Matrix placement and non-working uplines" },
  { name: "Royalty Club", value: 1, tone: "gold", note: "Club income shared by Five-Star members" },
];

const pillars = [
  { icon: Lock, title: "Immutable rules", copy: "Every allocation and payout rule is public contract code. Nobody can change it after deployment." },
  { icon: Zap, title: "Atomic settlement", copy: "Each registration is split into its pools in one transaction. It fully succeeds or fully reverts." },
  { icon: Eye, title: "Verifiable", copy: "Members, volume and balances are read live from the chain. Check any number on the block explorer." },
  { icon: WalletCards, title: "Self-custody", copy: "Funds leave your wallet only with your approval, and claims are paid straight back to it." },
];

const steps = [
  { icon: Wallet, title: "Connect a wallet", copy: "MetaMask, Trust Wallet, SafePal or any BSC-compatible wallet." },
  { icon: UserPlus, title: "Confirm your sponsor", copy: "Use your invite link, or the default sponsor if you weren't invited." },
  { icon: ShieldCheck, title: "Approve and register", copy: "One fixed 25 USDT entry, split by the contract in the same transaction." },
  { icon: Sparkles, title: "Track and claim", copy: "Follow every income stream on your dashboard and claim to your wallet." },
];

const faqs = [
  ["What does it cost to join?", "One fixed registration of 25 USDT, paid once. On this testnet build you use free test USDT that has no monetary value."],
  ["Who holds the funds?", "No one. The contract splits each registration into its pools in the same transaction. There is no admin wallet and no manual custody."],
  ["How are earnings paid?", "Rewards are credited on-chain under one of nine reason codes. Team income from the three pools is settled up to your cap, and everything is claimed to your own wallet."],
  ["Is this ready for real money?", "No. This is a testnet validation build. The contracts need an independent audit before production use, and the protocol promises no returns."],
] as const;

const reveal = { initial: { opacity: 0, y: 18 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: "-60px" }, transition: { duration: .5, ease: [.25, .1, .25, 1] } } as const;

export function Landing({ memberCount, total, ticket, member, joinPrompt, onLaunch }: { memberCount?: bigint; total?: bigint; ticket?: bigint; member?: { address: Address; id: bigint }; joinPrompt?: { connected: boolean; onJoin: () => void }; onLaunch: () => void }) {
  const price = ticket === undefined ? "25" : formatToken(ticket);
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return <div className="lp">
    <header className="lp-nav">
      <div className="lp-nav-inner">
        <button className="wordmark" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Open Protocol"><span className="brand-mark"><b>O</b><i>P</i></span><span className="brand-copy"><b>OPEN PROTOCOL</b><small>On-chain membership network</small></span></button>
        <nav>{[["earnings", "Earnings"], ["how", "How it works"], ["trust", "Trust"], ["faq", "FAQ"]].map(([id, label]) => <button key={id} onClick={() => jump(id)}>{label}</button>)}</nav>
        <button className="pill lp-launch" onClick={onLaunch}>Launch app <ArrowRight size={16}/></button>
      </div>
    </header>

    <section className="lp-hero">
      <div className="wrap-wide lp-hero-grid">
        <motion.div className="lp-hero-copy" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6 }}>
          <div className="environment-badge"><i/> LIVE ON BSC TESTNET</div>
          <h1>One entry.<br/><span className="grad">Nine income streams.</span></h1>
          <p className="lp-lede">Open Protocol is a community membership network on BNB Smart Chain. Every rule is written in immutable code, every payout is settled on-chain, and nobody holds your funds.</p>
          <div className="lp-actions">
            <button className="pill" onClick={onLaunch}>Get started <ArrowRight size={16}/></button>
            <button className="home-ghost" onClick={() => jump("earnings")}>See the earnings <ChevronRight size={15}/></button>
          </div>
          <div className="hero-trust"><span><Check size={13}/> {price} USDT one-time entry</span><span><Check size={13}/> Non-custodial</span><span><Check size={13}/> Open-source contract</span></div>
        </motion.div>

        <motion.div className="lp-ticket" initial={{ opacity: 0, scale: .96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .7, delay: .1 }}>
          <div className="lp-ticket-head"><span>MEMBERSHIP</span><small>BEP-20 · USDT</small></div>
          <div className="lp-ticket-price"><b>{price}</b><em>USDT</em></div>
          <div className="lp-ticket-bar">{split.map(s => <i key={s.name} className={s.tone} style={{ flex: s.value }}/>)}</div>
          <ul>{split.map(s => <li key={s.name}><span><i className={s.tone}/>{s.name}</span><b>{s.value}.00</b></li>)}</ul>
          <p><ShieldCheck size={14}/> Split atomically by the contract</p>
        </motion.div>
      </div>
    </section>

    {member ? <ReferralShare address={member.address} memberId={member.id}/> : joinPrompt && <ReferralJoinPrompt {...joinPrompt}/>}

    <section className="lp-stats">
      <div className="wrap-wide lp-stats-grid">
        <div><b>{memberCount?.toLocaleString() ?? "—"}</b><small>Registered members</small></div>
        <div><b>{total === undefined ? "—" : formatToken(total)}</b><small>USDT processed</small></div>
        <div><b>{incomeStreams.length}</b><small>Income streams</small></div>
        <div><b>0</b><small>Admin keys over funds</small></div>
      </div>
    </section>

    <section className="lp-section" id="earnings">
      <div className="wrap-wide">
        <motion.div className="lp-head" {...reveal}><small>EARNINGS</small><h2>Nine ways rewards are credited.</h2><p>Each stream is a separate reason code in the contract, so every credit on your dashboard traces back to the rule that paid it.</p></motion.div>
        <div className="lp-streams">{incomeStreams.map((s, i) => {
          const Icon = streamIcons[s.reason] ?? Award;
          return <motion.article key={s.reason} {...reveal} transition={{ ...reveal.transition, delay: (i % 3) * .06 }}>
            <div className="lp-stream-top"><span><Icon size={19}/></span><small>{String(i + 1).padStart(2, "0")}</small></div>
            <h3>{s.name}</h3><p>{s.note}</p>
          </motion.article>;
        })}</div>
        <p className="lp-footnote">Team income bundles the Single-Leg, Working and Non-Working pools, settled up to your pool cap.</p>
      </div>
    </section>

    <section className="lp-section lp-alt" id="how">
      <div className="wrap-wide">
        <motion.div className="lp-head" {...reveal}><small>HOW IT WORKS</small><h2>Join in about three minutes.</h2><p>Registration walks you through one step at a time and only asks for what's needed next.</p></motion.div>
        <ol className="lp-steps">{steps.map(({ icon: Icon, title, copy }, i) => <motion.li key={title} {...reveal} transition={{ ...reveal.transition, delay: i * .07 }}>
          <div className="lp-step-num">{i + 1}</div><span><Icon size={18}/></span><h3>{title}</h3><p>{copy}</p>
        </motion.li>)}</ol>
      </div>
    </section>

    <section className="lp-section" id="trust">
      <div className="wrap-wide lp-trust">
        <motion.div className="lp-head left" {...reveal}><small>WHY TRUST IT</small><h2>Built to be verified, not believed.</h2><p>No promises to take on faith. Read the code, then check every transaction yourself.</p>
          {protocolAddress && <a className="home-ghost" href={`${explorerUrl}/address/${protocolAddress}`} target="_blank" rel="noreferrer">View the contract <ExternalLink size={14}/></a>}
        </motion.div>
        <div className="lp-pillars">{pillars.map(({ icon: Icon, title, copy }) => <motion.article key={title} {...reveal}><span><Icon size={20}/></span><h3>{title}</h3><p>{copy}</p></motion.article>)}</div>
      </div>
    </section>

    <section className="lp-section lp-alt" id="faq">
      <div className="wrap">
        <motion.div className="lp-head" {...reveal}><small>FAQ</small><h2>Questions, answered.</h2></motion.div>
        <div className="home-faq">{faqs.map(([q, a]) => <details key={q}><summary>{q}<ChevronRight size={16}/></summary><p>{a}</p></details>)}</div>
      </div>
    </section>

    <section className="lp-cta">
      <motion.div className="wrap lp-cta-card" {...reveal}>
        <h2>Ready to <span className="grad">join the network?</span></h2>
        <p>Connect a wallet and register with test USDT. It takes a few minutes and costs nothing on testnet.</p>
        <button className="pill" onClick={onLaunch}>Launch app <ArrowRight size={16}/></button>
      </motion.div>
    </section>

    <footer>
      <div className="wrap">
        <p>Testnet validation build. Test USDT has no monetary value. The protocol promises no returns and requires an independent audit before production use.</p>
        <div className="footer-row"><span className="footer-brand"><i>OP</i> Open Protocol</span><span>Immutable core</span><span>BNB Smart Chain</span><span>USDT, BEP-20</span></div>
      </div>
    </footer>
  </div>;
}
