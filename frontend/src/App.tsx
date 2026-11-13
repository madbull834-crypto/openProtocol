import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AreaChart, Area, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";
import { ArrowUpRight, CheckCircle2, ChevronRight, CircleDollarSign, Copy, ExternalLink, Fingerprint, GitBranch, Globe2, LockKeyhole, Network, ShieldCheck, Sparkles, Users, WalletCards, Zap } from "lucide-react";
import { isAddress, zeroAddress, type Address } from "viem";
import { useAccount, useChainId, useReadContract, useReadContracts, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { chainId as requiredChainId, explorerUrl, protocolAddress } from "./config";
import { erc20Abi, protocolAbi } from "./contracts/abi";
import { useUi } from "./store/ui";
import { formatToken, shortAddress } from "./utils/format";

const allocation = [
  { name: "Working pool", value: 15, color: "#89ff45" },
  { name: "Non-working pool", value: 9, color: "#24c8ff" },
  { name: "Five-star club", value: 1, color: "#8b5cf6" },
];

const curve = [12, 20, 19, 34, 28, 47, 43, 62, 58, 74, 71, 92].map((value, i) => ({ i, value }));
const configured = Boolean(protocolAddress);

export default function App() {
  const { view, setView } = useUi();
  const { address, isConnected } = useAccount();
  const currentChain = useChainId();
  const { switchChain } = useSwitchChain();

  const base = protocolAddress ? { address: protocolAddress, abi: protocolAbi } : undefined;
  const reads = useReadContracts({
    allowFailure: true,
    contracts: base ? [
      { ...base, functionName: "memberCount" },
      { ...base, functionName: "totalParticipated" },
      { ...base, functionName: "ticketPrice" },
      { ...base, functionName: "paymentToken" },
      { ...base, functionName: "accountingInvariantHolds" },
    ] : [],
    query: { enabled: configured, refetchInterval: 12_000 },
  });
  const memberCount = reads.data?.[0]?.result as bigint | undefined;
  const total = reads.data?.[1]?.result as bigint | undefined;
  const ticket = reads.data?.[2]?.result as bigint | undefined;
  const token = reads.data?.[3]?.result as Address | undefined;
  const invariant = reads.data?.[4]?.result as boolean | undefined;
  const participantRead = useReadContract({
    ...(base ?? { address: zeroAddress, abi: protocolAbi }),
    functionName: "getParticipant",
    args: [address ?? zeroAddress],
    query: { enabled: configured && Boolean(address), refetchInterval: 12_000 },
  });
  const participant = participantRead.data;

  const nav = [
    ["overview", "Overview"], ["participate", "Participate"], ["referrals", "Referrals"], ["mechanics", "Mechanics"],
  ] as const;

  return <div className="app-shell">
    <div className="ambient ambient-a"/><div className="ambient ambient-b"/>
    <header className="topbar">
      <button className="brand" onClick={() => setView("overview")}><span className="brand-mark"><span/></span><span>OPEN <b>PROTOCOL</b></span></button>
      <nav>{nav.map(([key, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}</nav>
      <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
    </header>

    {!configured && <div className="setup-banner"><Zap size={16}/> Testnet interface ready. Set <code>VITE_PROTOCOL_ADDRESS</code> after deployment to enable live reads and transactions.</div>}
    {isConnected && currentChain !== requiredChainId && <button className="network-banner" onClick={() => switchChain({ chainId: requiredChainId })}>Wrong network — switch to BNB Smart Chain <ArrowUpRight size={16}/></button>}

    <main>
      <AnimatePresence mode="wait">
        {view === "overview" && <Overview key="overview" memberCount={memberCount} total={total} invariant={invariant} onParticipate={() => setView("participate")}/>} 
        {view === "participate" && <Participate key="participate" address={address} token={token} ticket={ticket} registered={Boolean(participant && participant.id > 0n)} refresh={() => { reads.refetch(); participantRead.refetch(); }}/>} 
        {view === "referrals" && <Referrals key="referrals" address={address} participant={participant}/>} 
        {view === "mechanics" && <Mechanics key="mechanics"/>}
      </AnimatePresence>
    </main>
    <footer><span>Open Protocol / testnet validation build</span><span>Immutable core · BSC · USDT</span><span>See OPEN_QUESTIONS.md before deployment</span></footer>
  </div>;
}

function Overview({ memberCount, total, invariant, onParticipate }: { memberCount?: bigint; total?: bigint; invariant?: boolean; onParticipate: () => void }) {
  return <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
    <div className="hero-grid">
      <div className="hero-copy">
        <div className="eyebrow"><Sparkles size={15}/> COMMUNITY INFRASTRUCTURE / ON-CHAIN</div>
        <h1>Participation,<br/><span>without a black box.</span></h1>
        <p>A transparent, immutable participation layer on BNB Smart Chain. Every ticket is allocated by code into three visible protocol pools.</p>
        <div className="hero-actions"><button className="primary" onClick={onParticipate}>Enter protocol <ChevronRight size={18}/></button><button className="secondary" onClick={() => document.getElementById("allocation")?.scrollIntoView({ behavior: "smooth" })}>Explore mechanics</button></div>
        <div className="trust-row"><span><ShieldCheck/>No admin keys</span><span><LockKeyhole/>Immutable routes</span><span><Globe2/>Public ledger</span></div>
      </div>
      <div className="protocol-orbit">
        <div className="orbit-ring ring-one"/><div className="orbit-ring ring-two"/>
        <div className="core"><span className="core-label">TICKET</span><strong>$25</strong><small>USDT · BEP-20</small></div>
        <div className="satellite sat-a"><i/>$15 <small>WORKING</small></div>
        <div className="satellite sat-b"><i/>$9 <small>NON-WORKING</small></div>
        <div className="satellite sat-c"><i/>$1 <small>5-STAR</small></div>
      </div>
    </div>

    <div className="metric-strip">
      <Metric label="Registered members" value={memberCount?.toLocaleString() ?? "Not deployed"} icon={<Users/>}/>
      <Metric label="Protocol participation" value={total === undefined ? "Not deployed" : `${formatToken(total)} USDT`} icon={<CircleDollarSign/>}/>
      <Metric label="Accounting check" value={invariant === undefined ? "Awaiting contract" : invariant ? "Reconciled" : "Mismatch"} icon={<CheckCircle2/>}/>
    </div>

    <div className="section-heading" id="allocation"><div><span>01 / ALLOCATION</span><h2>One ticket. Three transparent pools.</h2></div><p>Pool credits, matrix rewards, ranks, and withdrawals follow the documented testnet assumptions.</p></div>
    <div className="allocation-grid">
      <div className="glass pie-card"><ResponsiveContainer width="100%" height={280}><PieChart><Pie data={allocation} dataKey="value" innerRadius={78} outerRadius={108} paddingAngle={4} stroke="none">{allocation.map(x => <Cell key={x.name} fill={x.color}/>)}</Pie><Tooltip contentStyle={{ background: "#0a0e17", border: "1px solid #243149", borderRadius: 12 }}/></PieChart></ResponsiveContainer><div className="pie-center"><b>$25</b><span>per ticket</span></div></div>
      <div className="allocation-list">{allocation.map((item, i) => <div className="allocation-row" key={item.name}><span className="allocation-index">0{i + 1}</span><i style={{ background: item.color }}/><div><b>{item.name}</b><small>{item.value / 25 * 100}% of every ticket</small></div><strong>${item.value}</strong></div>)}</div>
      <div className="glass telemetry"><div className="card-label">NETWORK SIGNAL</div><div className="signal-value">BSC <span>TESTNET</span></div><ResponsiveContainer width="100%" height={130}><AreaChart data={curve}><defs><linearGradient id="signal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#89ff45" stopOpacity=".45"/><stop offset="1" stopColor="#89ff45" stopOpacity="0"/></linearGradient></defs><Area type="monotone" dataKey="value" stroke="#89ff45" strokeWidth={2} fill="url(#signal)"/></AreaChart></ResponsiveContainer><div className="telemetry-foot"><span><i/>LIVE READS</span><span>12s refresh</span></div></div>
    </div>
  </motion.section>;
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) { return <div className="metric"><span className="metric-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>; }

function Participate({ address, token, ticket, registered, refresh }: { address?: Address; token?: Address; ticket?: bigint; registered: boolean; refresh: () => void }) {
  const refFromUrl = new URLSearchParams(location.search).get("ref") ?? "";
  const [sponsor, setSponsor] = useState(refFromUrl);
  const { data: allowance, refetch: refetchAllowance } = useReadContract({ address: token ?? zeroAddress, abi: erc20Abi, functionName: "allowance", args: [address ?? zeroAddress, protocolAddress ?? zeroAddress], query: { enabled: Boolean(token && address && protocolAddress) } });
  const approve = useWriteContract(); const register = useWriteContract();
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const registerReceipt = useWaitForTransactionReceipt({ hash: register.data });
  const approved = ticket !== undefined && allowance !== undefined && allowance >= ticket;
  useEffect(() => { if (approveReceipt.isSuccess) refetchAllowance(); }, [approveReceipt.isSuccess, refetchAllowance]);
  useEffect(() => { if (registerReceipt.isSuccess) refresh(); }, [registerReceipt.isSuccess, refresh]);
  const validSponsor = isAddress(sponsor) && sponsor.toLowerCase() !== address?.toLowerCase();
  const busy = approve.isPending || approveReceipt.isLoading || register.isPending || registerReceipt.isLoading;

  return <motion.section className="page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
    <div className="page-title"><div><span>PARTICIPATION FLOW</span><h1>Enter with full visibility.</h1></div><p>Two wallet confirmations. Funds remain contract-backed until rewards are claimed.</p></div>
    <div className="flow-grid">
      <div className="glass action-panel">
        <div className="step-head"><span>01</span><div><b>Sponsor address</b><small>Permanent on-chain relationship</small></div></div>
        <label>Sponsor wallet<input value={sponsor} onChange={e => setSponsor(e.target.value.trim())} placeholder="0x…" spellCheck={false}/></label>
        <div className={`validation ${validSponsor ? "ok" : ""}`}>{validSponsor ? <><CheckCircle2/>Valid address</> : "Enter a valid sponsor other than your wallet"}</div>
        <div className="step-divider"/>
        <div className="step-head"><span>02</span><div><b>Authorize ticket</b><small>Exact allowance · {formatToken(ticket)} USDT</small></div></div>
        <div className="tx-summary"><div><span>Working pool</span><b>15 USDT</b></div><div><span>Non-working pool</span><b>9 USDT</b></div><div><span>Five-star club</span><b>1 USDT</b></div><div className="total"><span>Total</span><b>25 USDT</b></div></div>
        {!address ? <div className="connect-hint"><WalletCards/>Connect a wallet to continue</div> : registered ? <div className="success-box"><CheckCircle2/><div><b>Already participating</b><span>Your wallet is registered in the immutable graph.</span></div></div> : <div className="button-stack">
          {!approved && <button className="primary full" disabled={!token || !ticket || busy} onClick={() => approve.writeContract({ address: token!, abi: erc20Abi, functionName: "approve", args: [protocolAddress!, ticket!] })}>{approveReceipt.isLoading ? "Confirming approval…" : "Approve 25 USDT"}</button>}
          <button className="primary full" disabled={!approved || !validSponsor || busy} onClick={() => register.writeContract({ address: protocolAddress!, abi: protocolAbi, functionName: "register", args: [sponsor as Address] })}>{registerReceipt.isLoading ? "Allocating on-chain…" : approved ? "Confirm participation" : "Approve before participating"}</button>
        </div>}
        {(approve.error || register.error) && <div className="error-box">{(approve.error ?? register.error)?.message.split("\n")[0]}</div>}
        {registerReceipt.data && <a className="tx-link" href={`${explorerUrl}/tx/${registerReceipt.data.transactionHash}`} target="_blank" rel="noreferrer">View confirmed transaction <ExternalLink size={14}/></a>}
      </div>
      <div className="side-stack">
        <div className="glass info-card"><Fingerprint/><span>YOUR WALLET</span><b>{shortAddress(address)}</b><small>Your ticket funds contract-backed pool and reward accounting.</small></div>
        <div className="glass info-card"><ShieldCheck/><span>CONSERVATION</span><b>15 + 9 + 1 = 25</b><small>Registration reverts atomically if any recipient receives less than its exact amount.</small></div>
        <div className="warning"><LockKeyhole/><div><b>Testnet assumptions</b><span>Matrix, ranks, rewards, and withdrawals are enabled for validation and require audit before production.</span></div></div>
      </div>
    </div>
  </motion.section>;
}

function Referrals({ address, participant }: { address?: Address; participant?: { id: bigint; directCount: bigint; sponsor: Address; joinedAt: bigint } }) {
  const account = address ?? zeroAddress;
  const rewards = useReadContracts({
    contracts: protocolAddress ? [
      { address: protocolAddress, abi: protocolAbi, functionName: "withdrawable", args: [account] },
      { address: protocolAddress, abi: protocolAbi, functionName: "teamCount", args: [account] },
      { address: protocolAddress, abi: protocolAbi, functionName: "workingLevel", args: [account] },
      { address: protocolAddress, abi: protocolAbi, functionName: "nonWorkingLevel", args: [account] },
      { address: protocolAddress, abi: protocolAbi, functionName: "starRank", args: [account] },
      { address: protocolAddress, abi: protocolAbi, functionName: "matrixParent", args: [account] },
      { address: protocolAddress, abi: protocolAbi, functionName: "pendingSingleLegIncome", args: [account] },
      { address: protocolAddress, abi: protocolAbi, functionName: "pendingWorkingPoolIncome", args: [account] },
      { address: protocolAddress, abi: protocolAbi, functionName: "pendingNonWorkingPoolIncome", args: [account] },
    ] : [],
    query: { enabled: Boolean(protocolAddress && address), refetchInterval: 12_000 },
  });
  const claim = useWriteContract();
  const settle = useWriteContract();
  const claimReceipt = useWaitForTransactionReceipt({ hash: claim.data });
  const settleReceipt = useWaitForTransactionReceipt({ hash: settle.data });
  useEffect(() => { if (claimReceipt.isSuccess || settleReceipt.isSuccess) rewards.refetch(); }, [claimReceipt.isSuccess, settleReceipt.isSuccess, rewards.refetch]);
  const withdrawable = rewards.data?.[0]?.result as bigint | undefined;
  const team = rewards.data?.[1]?.result as bigint | undefined;
  const working = rewards.data?.[2]?.result as number | undefined;
  const nonWorking = rewards.data?.[3]?.result as number | undefined;
  const rank = rewards.data?.[4]?.result as number | undefined;
  const placement = rewards.data?.[5]?.result as Address | undefined;
  const queued = ([6, 7, 8] as const).reduce((sum, index) => sum + ((rewards.data?.[index]?.result as bigint | undefined) ?? 0n), 0n);
  const link = address ? `${location.origin}${location.pathname}?ref=${address}` : "Connect a wallet to generate your link";
  const joined = participant?.joinedAt ? new Date(Number(participant.joinedAt) * 1000).toLocaleDateString() : "—";
  return <motion.section className="page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
    <div className="page-title"><div><span>REFERRAL & REWARDS</span><h1>Your on-chain footprint.</h1></div><p>Sponsorship is permanent and placement follows the global breadth-first matrix.</p></div>
    <div className="ref-grid">
      <div className="glass referral-card"><GitBranch/><span>PERSONAL INVITE</span><div className="copy-field"><code>{link}</code><button disabled={!address} onClick={() => navigator.clipboard.writeText(link)}><Copy size={16}/></button></div><small>This link pre-fills your wallet as sponsor. It does not promise placement or income.</small></div>
      <div className="glass profile-card"><div className="profile-mark">#{participant?.id?.toString() ?? "—"}</div><div><span>MEMBER ID</span><b>{participant?.id?.toString() ?? "Not registered"}</b></div><div><span>DIRECT REFERRALS</span><b>{participant?.directCount?.toString() ?? "—"}</b></div><div><span>SPONSOR</span><b>{participant?.sponsor === zeroAddress ? "Genesis" : shortAddress(participant?.sponsor)}</b></div><div><span>JOINED</span><b>{joined}</b></div></div>
    </div>
    <div className="glass rewards-panel"><div><span>CLAIMABLE</span><b>{formatToken(withdrawable)} USDT</b></div><div><span>QUEUED POOLS</span><b>{formatToken(queued)} USDT</b></div><div><span>TEAM</span><b>{team?.toString() ?? "—"}</b></div><div><span>LEVELS</span><b>{working ?? "—"} / {nonWorking ?? "—"}</b></div><div><span>STAR RANK</span><b>{rank ?? "—"}</b></div><div><span>MATRIX PARENT</span><b>{placement === zeroAddress ? "Genesis" : shortAddress(placement)}</b></div><button className="primary" disabled={!address || queued === 0n || settle.isPending || settleReceipt.isLoading} onClick={() => settle.writeContract({ address: protocolAddress!, abi: protocolAbi, functionName: "settlePoolRewards" })}>{settleReceipt.isLoading ? "Settling…" : "Settle pools"}</button><button className="primary" disabled={!address || !withdrawable || claim.isPending || claimReceipt.isLoading} onClick={() => claim.writeContract({ address: protocolAddress!, abi: protocolAbi, functionName: "claim" })}>{claimReceipt.isLoading ? "Claiming…" : "Claim rewards"}</button></div>
  </motion.section>;
}

function Mechanics() { return <motion.section className="page" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
    <div className="page-title"><div><span>DOCUMENTED MECHANICS</span><h1>Facts separated from claims.</h1></div><p>Only reconciled rules are executable.</p></div>
    <div className="mechanics-grid">{[
      ["01", "$25 participation", "The source defines one USDT ticket on BNB Smart Chain."],
      ["02", "Exact allocation", "$15 working, $9 non-working, and $1 five-star club."],
      ["03", "Immutable sponsorship", "A wallet registers once against an existing sponsor."],
      ["04", "No protocol admin", "The implemented core has no owner, upgrade, pause, or rescue authority."],
      ["05", "Testnet reward engine", "Matrix income, uplines, levels, ranks, re-entry, weekly rewards, and claims use explicit prototype assumptions."],
      ["06", "Public verification", "Events, balances, recipients, and accounting totals remain queryable."],
    ].map(([n, title, body]) => <div className="mechanic" key={n}><span>{n}</span><h3>{title}</h3><p>{body}</p><ArrowUpRight/></div>)}</div>
    <div className="disclosure"><ShieldCheck/><div><b>Testnet validation only</b><p>This build does not represent guaranteed returns and is not ready for mainnet. Missing financial rules require written clarification and independent security/legal review.</p></div></div>
  </motion.section>;
}
