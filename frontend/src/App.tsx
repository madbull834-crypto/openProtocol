import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowRight, ArrowUpRight, Award, Calendar, Check, ChevronLeft, ChevronRight, Clock, Coins, Copy, Crown, ExternalLink, Eye, Fuel, Layers, LayoutGrid, Lock, LockOpen, MessageCircle, Network, Send, Share2, ShieldCheck, TrendingUp, Trophy, UserRoundCheck, Users, Wallet, WalletCards, Zap } from "lucide-react";
import { decodeFunctionResult, encodeFunctionData, isAddress, zeroAddress, type Address } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract, useReadContracts, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { chainId as requiredChainId, deploymentError, explorerUrl, genesisSponsor, protocolAddress, testTokenAddress, walletConnectEnabled } from "./config";
import { erc20Abi, mockUsdtAbi, protocolAbi } from "./contracts/abi";
import { useUi } from "./store/ui";
import { formatToken, shortAddress } from "./utils/format";
import { incomeName, incomeStreams, useClubFunds, useIncomeHistory, useLedger, usePoolSources, type CreditSource, type LedgerFilter } from "./income";
import { useOnchainDirects, useOnchainIncome, useOnchainTeam, useProtocolRules, useSingleLegLine, type ProtocolRules, type RankRule } from "./onchain";
import { Landing } from "./Landing";
import { ReferralJoinPrompt, ReferralShare } from "./ReferralShare";

const allocation = [
  { name: "Working Matrix", value: 15, tone: "blue", note: "Funds 80% direct income and the nine Working Matrix upline levels." },
  { name: "Non-Working", value: 5, tone: "purple", note: "Funds Non-Working level income and re-entry, paid straight into the Non-Working pool." },
  { name: "Single-Leg", value: 9, tone: "green", note: "Funds Single-Leg level rewards and the Level 3 re-entry." },
  { name: "Weekly Superstar", value: 1, tone: "gold", note: "Added to the weekly fund for a recruiter who reaches at least five directs." },
];

const configured = Boolean(protocolAddress);
const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: .4, ease: [.25, .1, .25, 1] } } as const;

export default function App() {
  const { view, setView } = useUi();
  const { address, isConnected, chainId: connectedChainId } = useAccount();
  const currentChain = connectedChainId ?? requiredChainId;
  const { switchChain } = useSwitchChain();

  const base = protocolAddress ? { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId } : undefined;
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
    ...(base ?? { address: zeroAddress, abi: protocolAbi, chainId: requiredChainId }),
    functionName: "getParticipant",
    args: [address ?? zeroAddress],
    query: { enabled: configured && Boolean(address), refetchInterval: 12_000 },
  });
  const participant = participantRead.data;
  const isRegistered = Boolean(participant && participant.id > 0n);

  const nav = isRegistered
    ? [["overview", "Home"], ["referrals", "Dashboard"], ["mechanics", "Mechanics"]] as const
    : [["overview", "Home"], ["participate", "Join"], ["referrals", "Network"], ["mechanics", "Mechanics"]] as const;

  const member = isRegistered && address && participant ? { address, id: participant.id } : undefined;
  // Ask to join only once we know the wallet isn't a member, so registered users don't see a flash of the locked card.
  const joinPrompt = !member && (!address || participant !== undefined) ? { connected: Boolean(address), onJoin: () => setView("participate") } : undefined;

  if (view === "landing") return <Landing memberCount={memberCount} total={total} ticket={ticket} member={member} joinPrompt={joinPrompt} onLaunch={() => setView(isRegistered ? "referrals" : "overview")}/>;

  return <div className="shell">
    <header className="globalnav">
      <div className="globalnav-inner">
        <button className="wordmark" onClick={() => setView("landing")} aria-label="Open Protocol home"><span className="brand-mark"><b>O</b><i>P</i></span><span className="brand-copy"><b>OPEN PROTOCOL</b><small>On-chain membership network</small></span></button>
        <nav>{nav.map(([key, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}</nav>
        <div className="globalnav-right"><GetTestUsdtButton/><ConnectButton accountStatus="address" chainStatus="none" showBalance={false} label="Connect"/></div>
      </div>
    </header>

    {!configured && <div className={`ribbon ${deploymentError ? "ribbon-warn" : ""}`}>{deploymentError ?? <>Interface ready. Set <code>VITE_PROTOCOL_ADDRESS</code> after deployment and live reads and transactions switch on.</>}</div>}
    {!walletConnectEnabled && !isConnected && <div className="ribbon">Connect any injected EVM wallet. On mobile, open this page inside SafePal, MetaMask, Trust Wallet, Binance Wallet, or another wallet's DApp browser.</div>}
    {isConnected && currentChain !== requiredChainId && <button className="ribbon ribbon-warn" onClick={() => switchChain({ chainId: requiredChainId })}>This wallet is on another network. Switch to BNB Smart Chain <ChevronRight size={14}/></button>}

    <main>
      <AnimatePresence mode="wait">
        {view === "overview" && <Overview key="overview" memberCount={memberCount} total={total} ticket={ticket} invariant={invariant} registered={isRegistered} member={member} joinPrompt={joinPrompt} onParticipate={() => setView("participate")} onDashboard={() => setView("referrals")} onMechanics={() => setView("mechanics")}/>}
        {view === "participate" && <Participate
          key="participate"
          address={address}
          currentChain={currentChain}
          token={token}
          ticket={ticket}
          registered={isRegistered}
          refresh={() => { reads.refetch(); participantRead.refetch(); }}
          onOpenDashboard={() => setView("referrals")}
        />}
        {view === "referrals" && <Referrals key="referrals" address={address} participant={participant} onParticipate={() => setView("participate")}/>}
        {view === "mechanics" && <Mechanics key="mechanics"/>}
      </AnimatePresence>
    </main>

    <footer>
      <div className="wrap">
        <p>This is a testnet validation build. It promises no returns and is not ready for mainnet. Read OPEN_QUESTIONS.md before any deployment.</p>
        <div className="footer-row"><span className="footer-brand"><i>OP</i> Open Protocol</span><span>Immutable core</span><span>BNB Smart Chain</span><span>USDT, BEP-20</span></div>
      </div>
    </footer>
  </div>;
}

const TEST_USDT_AMOUNT = 1_000_000_000n; // 1,000 MockUSDT (6 decimals)

function GetTestUsdtButton() {
  const { address, chainId: connectedChainId } = useAccount();
  const { switchChain } = useSwitchChain();
  const mint = useWriteContract();
  const receipt = useWaitForTransactionReceipt({ hash: mint.data, chainId: 97 });
  const [flash, setFlash] = useState<string>();

  useEffect(() => {
    if (receipt.isSuccess) { setFlash("+1,000 USDT received"); const t = setTimeout(() => { setFlash(undefined); mint.reset(); }, 4000); return () => clearTimeout(t); }
  }, [receipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!mint.error) return;
    const msg = /insufficient funds|gas required exceeds/i.test(mint.error.message) ? "Need test BNB for gas"
      : /user rejected|user denied/i.test(mint.error.message) ? "Cancelled" : "Mint failed";
    setFlash(msg); const t = setTimeout(() => { setFlash(undefined); mint.reset(); }, 4000); return () => clearTimeout(t);
  }, [mint.error]); // eslint-disable-line react-hooks/exhaustive-deps

  if (requiredChainId !== 97 || !testTokenAddress || !address) return null;
  const wrongChain = connectedChainId !== 97;
  const busy = mint.isPending || receipt.isLoading;
  const label = flash ?? (mint.isPending ? "Confirm in wallet…" : receipt.isLoading ? "Minting…" : wrongChain ? "Switch to get Test USDT" : "Get Test USDT");
  const onClick = () => {
    if (busy) return;
    if (wrongChain) { switchChain({ chainId: 97 }); return; }
    mint.writeContract({ address: testTokenAddress!, abi: mockUsdtAbi, functionName: "mint", args: [address, TEST_USDT_AMOUNT], chainId: 97 });
  };
  return <button className="test-usdt-btn" disabled={busy} onClick={onClick} title="Mint 1,000 MockUSDT (testnet only, no monetary value)"><Coins size={14}/> {label}</button>;
}

const faqs = [
  ["What does it cost to join?", "One fixed registration of 30 USDT, paid once. On this testnet build you use free test USDT that has no monetary value."],
  ["Who holds the funds?", "No one. The smart contract splits each registration into its pools in the same transaction. There is no admin wallet and no manual custody."],
  ["Why do I need a sponsor?", "Every member joins under an existing member, and the link is recorded on-chain permanently. If you were not invited, the verified testnet sponsor is filled in for you."],
  ["What do I need to get started?", "A BSC-compatible wallet such as MetaMask, Trust Wallet or SafePal, and a little test BNB for gas. Test USDT can be minted in one click during registration."],
  ["Is this ready for real money?", "No. This is a testnet validation build. The contracts need an independent audit before production use, and the protocol promises no returns."],
] as const;

const features = [
  { icon: Lock, title: "Immutable rules", copy: "Every allocation and payout rule lives in public contract code. Nobody can change it after deployment." },
  { icon: Zap, title: "Instant settlement", copy: "Your registration is split into its pools in a single transaction. It either fully succeeds or fully reverts." },
  { icon: Eye, title: "Fully transparent", copy: "Members, volume and pool balances are read live from the chain. Verify any number on the block explorer." },
  { icon: WalletCards, title: "Self-custody", copy: "Funds move only from your own wallet, only with your approval, and rewards are claimed straight back to it." },
];

function Overview({ memberCount, total, ticket, invariant, registered, member, joinPrompt, onParticipate, onDashboard, onMechanics }: { memberCount?: bigint; total?: bigint; ticket?: bigint; invariant?: boolean; registered: boolean; member?: { address: Address; id: bigint }; joinPrompt?: { connected: boolean; onJoin: () => void }; onParticipate: () => void; onDashboard: () => void; onMechanics: () => void }) {
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const primary = registered ? { label: "Open dashboard", onClick: onDashboard } : { label: "Get started", onClick: onParticipate };
  const price = ticket === undefined ? "30" : formatToken(ticket);
  return <motion.div {...fade}>
    <section className="home-hero">
      <div className="wrap-wide home-hero-grid">
        <div className="home-hero-copy">
          <div className="environment-badge"><i/> LIVE ON BSC TESTNET</div>
          <h1>Grow together.<br/><span className="grad">Settled on-chain.</span></h1>
          <p>Open Protocol is a transparent membership network on BNB Smart Chain. One fixed entry, public rules, and every payout enforced by smart contract, with no custody and no hidden fees.</p>
          <div className="home-actions">
            <button className="pill" onClick={primary.onClick}>{primary.label}</button>
            <button className="home-ghost" onClick={() => scrollTo("how-it-works")}>How it works</button>
          </div>
          <div className="hero-trust"><span><Check size={13}/> {price} USDT one-time entry</span><span><Check size={13}/> Non-custodial</span><span><Check size={13}/> Open-source contract</span></div>
        </div>
        <div className="home-orbit-panel" aria-label={`${price} USDT membership allocation`}>
          <div className="orbit-system"><i className="orbit-line one"/><i className="orbit-line two"/><i className="orbit-node first"/><i className="orbit-node second"/><div className="orbit-core"><span>OP</span><b>{price}</b><small>USDT MEMBERSHIP</small></div></div>
          <div className="orbit-allocation"><small>CONTRACT ALLOCATION</small><div>{allocation.map(a => <span key={a.name}><i className={a.tone}/><b>{a.value}</b><em>{a.name}</em></span>)}</div><p><ShieldCheck size={14}/> Settled atomically on BNB Chain</p></div>
        </div>
      </div>
    </section>

    {member ? <ReferralShare address={member.address} memberId={member.id}/> : joinPrompt && <ReferralJoinPrompt {...joinPrompt}/>}

    <section className="overview-proof">
      <div className="wrap-wide proof-grid">
        <div><small>REGISTERED MEMBERS</small><b>{memberCount?.toLocaleString() ?? "—"}</b></div>
        <div><small>USDT PROCESSED</small><b>{total === undefined ? "—" : formatToken(total)}</b></div>
        <div><small>NETWORK</small><b>BNB Chain</b></div>
        <div><small>ACCOUNTING</small><b className={invariant ? "verified" : ""}>{invariant === undefined ? "Checking" : invariant ? "Reconciled" : "Review required"}</b></div>
      </div>
    </section>

    <section className="home-section">
      <div className="wrap-wide">
        <div className="overview-section-head"><small>WHY OPEN PROTOCOL</small><h2>Built to be trusted, not believed.</h2><p>No promises to take on faith. Every rule is code you can read and every transaction is public.</p></div>
        <div className="home-features">{features.map(({ icon: Icon, title, copy }) => <article key={title}><span><Icon size={20}/></span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </div>
    </section>

    <section className="simple-flow" id="how-it-works">
      <div className="wrap-wide">
        <div className="overview-section-head"><small>HOW IT WORKS</small><h2>Join in about three minutes.</h2><p>Registration walks you through one step at a time and only asks for what is needed next.</p></div>
        <div className="join-flow">
          {[
            { icon: WalletCards, title: "Connect wallet", copy: "Use MetaMask, Trust Wallet, SafePal or any BSC wallet.", tag: "Free" },
            { icon: UserRoundCheck, title: "Confirm sponsor", copy: "Your referral link fills this in. We verify it on-chain.", tag: "Automatic" },
            { icon: Coins, title: "Add test funds", copy: "Mint free test USDT in one click. Test BNB covers gas.", tag: "Testnet only" },
            { icon: ShieldCheck, title: "Approve & join", copy: `Approve exactly ${price} USDT, then confirm registration.`, tag: "2 confirmations" },
          ].map(({ icon: Icon, title, copy, tag }, index) => <article key={title}><div className="flow-top"><span><Icon size={19}/></span><small>STEP 0{index + 1}</small></div><h3>{title}</h3><p>{copy}</p><em>{tag}</em>{index < 3 && <i><ChevronRight size={16}/></i>}</article>)}
        </div>
      </div>
    </section>

    <section className="after-join">
      <div className="wrap-wide after-join-grid">
        <div className="dashboard-preview"><div className="preview-top"><span><i/> MEMBER DASHBOARD</span><small>LIVE ON-CHAIN</small></div><div className="preview-balance"><small>AVAILABLE TO CLAIM</small><b>0.00 <em>USDT</em></b></div><div className="preview-metrics"><span><small>DIRECTS</small><b>0</b></span><span><small>TEAM</small><b>0</b></span><span><small>RANK</small><b>Member</b></span></div></div>
        <div className="after-copy"><small>YOUR DASHBOARD</small><h2>Everything in one place.</h2><p>Share your referral link, follow your team and rank, see every income stream and claim rewards straight to your wallet.</p><ul><li><Check size={14}/> Referral link and team growth</li><li><Check size={14}/> Income from every pool</li><li><Check size={14}/> Matrix and level views</li><li><Check size={14}/> One-click claims</li></ul><button className="home-ghost" onClick={onMechanics}>Read the reward rules <ChevronRight size={15}/></button></div>
      </div>
    </section>

    <section className="home-section">
      <div className="wrap home-faq-wrap">
        <div className="overview-section-head"><small>FAQ</small><h2>Questions, answered.</h2></div>
        <div className="home-faq">{faqs.map(([q, a]) => <details key={q}><summary>{q}<ChevronRight size={16}/></summary><p>{a}</p></details>)}</div>
      </div>
    </section>

    <section className="home-final">
      <div className="wrap home-final-inner">
        <h2>Ready to join?</h2>
        <p>{registered ? "Your membership is active. Open your dashboard to share your link and track rewards." : "Create your membership on testnet in a few minutes. Test tokens are free."}</p>
        <button className="pill" onClick={primary.onClick}>{primary.label}</button>
      </div>
    </section>

    <section className="overview-disclaimer"><div className="wrap-wide"><ShieldCheck size={18}/><p><b>Testnet validation build.</b> Test USDT has no monetary value. The protocol promises no returns and requires an independent audit before production use.</p>{protocolAddress && <a href={`${explorerUrl}/address/${protocolAddress}`} target="_blank" rel="noreferrer">View contract <ExternalLink size={12}/></a>}</div></section>
  </motion.div>;
}

function Participate({ address, currentChain, token, ticket, registered, refresh, onOpenDashboard }: { address?: Address; currentChain: number; token?: Address; ticket?: bigint; registered: boolean; refresh: () => void; onOpenDashboard: () => void }) {
  const { connector } = useAccount();
  const { switchChain } = useSwitchChain();
  const refFromUrl = new URLSearchParams(location.search).get("ref") ?? "";
  const [sponsor, setSponsor] = useState(refFromUrl || genesisSponsor || "");
  const [editingSponsor, setEditingSponsor] = useState(false);
  const [assetStatus, setAssetStatus] = useState<"idle" | "adding" | "added" | "unsupported">("idle");
  const [walletProviderBalance, setWalletProviderBalance] = useState<bigint>();
  const paymentToken = token ?? (requiredChainId === 97 ? testTokenAddress : undefined);
  const effectiveTicket = ticket ?? (requiredChainId === 97 ? 25_000_000n : undefined);
  const { data: allowance, refetch: refetchAllowance } = useReadContract({ address: paymentToken ?? zeroAddress, abi: erc20Abi, functionName: "allowance", args: [address ?? zeroAddress, protocolAddress ?? zeroAddress], chainId: requiredChainId, query: { enabled: Boolean(paymentToken && address && protocolAddress) } });
  const balanceToken = paymentToken;
  const { data: balance, refetch: refetchBalance } = useReadContract({ address: balanceToken ?? zeroAddress, abi: erc20Abi, functionName: "balanceOf", args: [address ?? zeroAddress], chainId: 97, query: { enabled: Boolean(balanceToken && address), refetchInterval: 2_000, staleTime: 0 } });
  const { data: gasBalance } = useBalance({ address, query: { enabled: Boolean(address) && currentChain === 97 } });
  const sponsorAddressValid = isAddress(sponsor) && sponsor.toLowerCase() !== address?.toLowerCase();
  const sponsorRead = useReadContract({
    ...(protocolAddress ? { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId } : { address: zeroAddress, abi: protocolAbi, chainId: requiredChainId }),
    functionName: "getParticipant",
    args: [sponsorAddressValid ? sponsor as Address : zeroAddress],
    query: { enabled: configured && sponsorAddressValid, retry: 2 },
  });
  const mint = useWriteContract(); const approve = useWriteContract(); const register = useWriteContract();
  const mintReceipt = useWaitForTransactionReceipt({ hash: mint.data });
  const approveReceipt = useWaitForTransactionReceipt({ hash: approve.data });
  const registerReceipt = useWaitForTransactionReceipt({ hash: register.data });
  const registrationHandled = useRef(false);
  const approved = effectiveTicket !== undefined && allowance !== undefined && allowance >= effectiveTicket;
  useEffect(() => { setWalletProviderBalance(undefined); }, [address]);
  useEffect(() => {
    if (!mintReceipt.isSuccess || !connector || !address || !balanceToken) return;
    let active = true;
    const verifyWalletBalance = async () => {
      try {
        const provider = await connector.getProvider() as { request?: (request: { method: string; params?: unknown }) => Promise<unknown> };
        if (!provider.request) return;
        const result = await provider.request({
          method: "eth_call",
          params: [{ to: balanceToken, data: encodeFunctionData({ abi: erc20Abi, functionName: "balanceOf", args: [address] }) }, "latest"],
        });
        if (active && typeof result === "string") {
          setWalletProviderBalance(decodeFunctionResult({ abi: erc20Abi, functionName: "balanceOf", data: result as `0x${string}` }) as bigint);
        }
      } catch {
        // The public-chain read continues polling if this wallet does not support eth_call.
      }
    };
    void refetchBalance();
    void verifyWalletBalance();
    const retry = window.setTimeout(() => { void refetchBalance(); void verifyWalletBalance(); }, 3_000);
    return () => { active = false; window.clearTimeout(retry); };
  }, [mintReceipt.isSuccess, mintReceipt.data?.transactionHash, connector, address, balanceToken, refetchBalance]);
  useEffect(() => { if (approveReceipt.isSuccess) refetchAllowance(); }, [approveReceipt.isSuccess, refetchAllowance]);
  useEffect(() => {
    if (!registerReceipt.isSuccess || registrationHandled.current) return;
    registrationHandled.current = true;
    refresh();
    onOpenDashboard();
  }, [registerReceipt.isSuccess, refresh, onOpenDashboard]);
  const isConfiguredGenesis = requiredChainId === 97 && Boolean(genesisSponsor) && sponsor.toLowerCase() === genesisSponsor?.toLowerCase();
  const validSponsor = sponsorAddressValid && (isConfiguredGenesis || Boolean(sponsorRead.data && sponsorRead.data.id > 0n));
  const displayedBalance = walletProviderBalance ?? balance;
  const hasBalance = effectiveTicket !== undefined && displayedBalance !== undefined && displayedBalance >= effectiveTicket;
  const busy = mint.isPending || mintReceipt.isLoading || approve.isPending || approveReceipt.isLoading || register.isPending || registerReceipt.isLoading;
  const showTestFaucet = requiredChainId === 97 && Boolean(testTokenAddress);
  const testTokenMatches = Boolean(paymentToken && testTokenAddress && paymentToken.toLowerCase() === testTokenAddress.toLowerCase());
  const testTokenCompatible = !paymentToken || testTokenMatches;
  const needsTestBnb = gasBalance?.value === 0n;
  const canUseTestFundsButton = Boolean(address) && testTokenCompatible && !busy;
  const mintButtonLabel = mint.isPending ? "Confirm in wallet…" : mintReceipt.isLoading ? "Minting…" : currentChain !== 97 ? "Switch network" : "Get 1,000 test USDT";
  const handleTestFunds = () => {
    if (!address || busy || !testTokenCompatible) return;
    if (currentChain !== 97) {
      switchChain({ chainId: 97 });
      return;
    }
    if (needsTestBnb) {
      window.open("https://www.bnbchain.org/en/testnet-faucet", "_blank", "noopener,noreferrer");
      return;
    }
    mint.reset();
    mint.writeContract({ address: testTokenAddress!, abi: mockUsdtAbi, functionName: "mint", args: [address, 1_000_000_000n], chainId: 97 });
  };
  const mintErrorMessage = mint.error && (/insufficient funds|gas required exceeds allowance/i.test(mint.error.message)
    ? "Your wallet needs BSC Testnet BNB to pay the mint transaction fee. Get free test BNB from the faucet below, then try again."
    : /current chain.*does not match|chain mismatch/i.test(mint.error.message)
      ? "Your wallet is on the wrong network. Switch it to BNB Smart Chain Testnet (chain ID 97), then mint again."
    : /user rejected|user denied/i.test(mint.error.message)
      ? "The mint transaction was cancelled in your wallet."
      : mint.error.message.split("\n")[0]);
  const transactionError = mintErrorMessage ?? (approve.error && (/user rejected|user denied/i.test(approve.error.message)
    ? "The approval was cancelled in your wallet."
    : /current chain.*does not match|chain mismatch/i.test(approve.error.message)
      ? "Your wallet is on the wrong network. Switch it to BNB Smart Chain Testnet (chain ID 97), then approve again."
    : /undefined.*invalid|address.*undefined/i.test(approve.error.message)
      ? "The protocol or USDT contract address is unavailable. Refresh the page before approving."
    : approve.error.message.split("\n")[0])) ?? (register.error && (/AlreadyRegistered/i.test(register.error.message)
      ? "This wallet is already registered."
      : /SponsorNotRegistered/i.test(register.error.message)
        ? "The selected sponsor is not registered. Use the verified testnet sponsor shown above."
        : /insufficient.*balance|exceeds balance/i.test(register.error.message)
          ? `Your wallet needs at least ${formatToken(ticket ?? 30_000_000n)} USDT before it can register.`
          : /allowance|approval/i.test(register.error.message)
            ? `The USDT approval is missing or expired. Approve ${formatToken(ticket ?? 30_000_000n)} USDT again.`
            : /user rejected|user denied/i.test(register.error.message)
              ? "Registration was cancelled in your wallet."
              : /current chain.*does not match|chain mismatch/i.test(register.error.message)
                ? "Your wallet is on the wrong network. Switch it to BNB Smart Chain Testnet (chain ID 97), then register again."
              : register.error.message.split("\n")[0]));
  const addTokenToWallet = async () => {
    if (!connector || !testTokenAddress) return;
    setAssetStatus("adding");
    try {
      const provider = await connector.getProvider() as { request?: (request: { method: string; params?: unknown }) => Promise<unknown> };
      if (!provider.request) throw new Error("wallet_watchAsset is unavailable");
      const added = await provider.request({
        method: "wallet_watchAsset",
        params: { type: "ERC20", options: { address: testTokenAddress, symbol: "USDT", decimals: 6 } },
      });
      setAssetStatus(added === false ? "idle" : "added");
    } catch {
      setAssetStatus("unsupported");
    }
  };
  const sponsorMessage = !sponsor ? "Paste the wallet address of the member who invited you." : !sponsorAddressValid ? "Enter a valid wallet address that is not your own." : sponsorRead.isLoading ? "Checking this sponsor on-chain…" : validSponsor ? "Sponsor verified on-chain." : "This address is not a registered member.";
  const onRequiredChain = currentChain === requiredChainId;
  const networkName = requiredChainId === 97 ? "BSC Testnet" : "BNB Smart Chain";
  const price = effectiveTicket === undefined ? "25" : formatToken(effectiveTicket);
  const stepDone = [Boolean(address && onRequiredChain), validSponsor && !editingSponsor, hasBalance, false];
  const active = registered ? -1 : stepDone.findIndex(done => !done);
  const progress = registered ? 100 : Math.round((stepDone.filter(Boolean).length / 4) * 100);
  const lastTx = registerReceipt.data?.transactionHash ?? approveReceipt.data?.transactionHash ?? mintReceipt.data?.transactionHash;

  const renderStep = (index: number, title: string, summary: ReactNode, body: ReactNode, action?: ReactNode) => {
    const state = index === active ? "active" : stepDone[index] ? "done" : "locked";
    return <li className={`wz-step is-${state}`} key={title}>
      <div className="wz-marker">{state === "done" ? <Check size={15}/> : index + 1}</div>
      <div className="wz-body">
        <div className="wz-head"><h3>{title}</h3>{state === "done" ? <span className="wz-summary-line"><span>{summary}</span>{action}</span> : state === "locked" ? <span className="wz-muted">Waiting</span> : null}</div>
        {state === "active" && <div className="wz-content">{body}{transactionError && <p className="error">{transactionError}</p>}</div>}
      </div>
    </li>;
  };

  return <motion.div {...fade}>
    <section className="wz-hero">
      <div className="wrap-wide">
        <div className="environment-badge"><i/> {requiredChainId === 97 ? "BSC TESTNET · TEST TOKENS ONLY" : "BNB SMART CHAIN"}</div>
        <h1>{registered ? "You're a member." : "Create your membership"}</h1>
        <p>{registered ? "Registration is complete and your dashboard is ready." : "Four short steps. Only the step you're on needs your attention."}</p>
        <div className="wz-progress"><div><i style={{ width: `${progress}%` }}/></div><span>{registered ? "Complete" : `Step ${active + 1} of 4`}</span></div>
      </div>
    </section>

    <section className="wz-band">
      <div className="wrap-wide wz-layout">
        {registered ? <div className="wz-success">
          <span><Check size={26}/></span>
          <h2>Welcome to Open Protocol</h2>
          <p>Your membership is recorded on-chain. Share your referral link from the dashboard to start building your team.</p>
          <button className="pill" onClick={onOpenDashboard}>Open dashboard <ArrowRight size={16}/></button>
          {registerReceipt.data && <a className="wz-link" href={`${explorerUrl}/tx/${registerReceipt.data.transactionHash}`} target="_blank" rel="noreferrer">View registration transaction <ExternalLink size={12}/></a>}
        </div> : <ol className="wz-steps">
          {renderStep(0, "Connect your wallet",
            <>{shortAddress(address)} · {networkName}</>,
            !address ? <>
              <p>Use MetaMask, Trust Wallet, SafePal or any BSC-compatible wallet. Connecting is free and does not move any funds.</p>
              <ConnectButton label="Connect wallet" accountStatus="address" chainStatus="none" showBalance={false}/>
            </> : <>
              <p>Your wallet is connected to another network. Switch to {networkName} to continue.</p>
              <button className="pill" onClick={() => switchChain({ chainId: requiredChainId })}>Switch to {networkName}</button>
            </>)}

          {renderStep(1, "Confirm your sponsor",
            <>{shortAddress(sponsor)}{isConfiguredGenesis ? " · Default sponsor" : refFromUrl ? " · From your invite link" : ""}</>,
            <>
              <p>Your sponsor is the member who invited you. It is recorded permanently and cannot be changed later.</p>
              <label className="premium-input"><span>Sponsor wallet address</span><input value={sponsor} onChange={e => setSponsor(e.target.value.trim())} placeholder="0x…" spellCheck={false} autoComplete="off"/></label>
              <p className={`hint ${validSponsor ? "ok" : ""}`}>{validSponsor && <Check size={14}/>} {sponsorMessage}</p>
              {genesisSponsor && sponsor.toLowerCase() !== genesisSponsor.toLowerCase() && <button className="wz-link" onClick={() => setSponsor(genesisSponsor ?? "")}>No invite? Use the default sponsor</button>}
              {editingSponsor && <button className="pill" disabled={!validSponsor} onClick={() => setEditingSponsor(false)}>Use this sponsor</button>}
            </>,
            <button className="wz-change" onClick={() => setEditingSponsor(true)}>Change</button>)}

          {renderStep(2, requiredChainId === 97 ? "Add test funds" : "Fund your wallet",
            <>{formatToken(displayedBalance)} USDT available</>,
            showTestFaucet ? <>
              <p>You need {price} USDT to register and a little BNB for network fees. On testnet both are free.</p>
              <div className="wz-checklist">
                <div className={needsTestBnb ? "" : "ok"}><span>{needsTestBnb ? <Fuel size={16}/> : <Check size={16}/>}</span><div><b>Test BNB for gas</b><em>{gasBalance ? `${Number(gasBalance.formatted).toFixed(4)} BNB` : "Checking…"}</em></div>{needsTestBnb && <a className="wz-mini" href="https://www.bnbchain.org/en/testnet-faucet" target="_blank" rel="noreferrer">Get test BNB <ExternalLink size={11}/></a>}</div>
                <div className={hasBalance ? "ok" : ""}><span>{hasBalance ? <Check size={16}/> : <Coins size={16}/>}</span><div><b>Test USDT</b><em>{formatToken(displayedBalance)} of {price} required</em></div><button className="wz-mini primary" disabled={!canUseTestFundsButton || needsTestBnb} onClick={handleTestFunds}>{mintButtonLabel}</button></div>
              </div>
              <button className="wz-link" disabled={assetStatus === "adding"} onClick={addTokenToWallet}>{assetStatus === "added" ? "Test USDT added to your wallet" : assetStatus === "unsupported" ? `Import ${shortAddress(testTokenAddress)} manually (6 decimals)` : "Show test USDT in my wallet"}</button>
            </> : <p>Your wallet needs at least {price} USDT plus a little BNB for fees. Current balance: {formatToken(displayedBalance)} USDT.</p>)}

          {renderStep(3, "Approve and register",
            null,
            <>
              <div className="wz-substeps">
                <div className={approved ? "ok" : "current"}><span>{approved ? <Check size={13}/> : "A"}</span><div><b>Approve {price} USDT</b><em>Lets the contract take exactly the registration amount, nothing more.</em></div></div>
                <div className={approved ? "current" : ""}><span>B</span><div><b>Confirm registration</b><em>Pays {price} USDT, records your sponsor and opens your dashboard.</em></div></div>
              </div>
              {!approved
                ? <button className="pill wide" disabled={!protocolAddress || !paymentToken || !effectiveTicket || busy} onClick={() => approve.writeContract({ address: paymentToken!, abi: erc20Abi, functionName: "approve", args: [protocolAddress!, effectiveTicket!], chainId: requiredChainId })}>{approve.isPending ? "Confirm in your wallet…" : approveReceipt.isLoading ? "Approving…" : `Approve ${price} USDT`}</button>
                : <button className="pill wide register-button" disabled={!protocolAddress || busy} onClick={() => register.writeContract({ address: protocolAddress!, abi: protocolAbi, functionName: "register", args: [sponsor as Address], chainId: requiredChainId })}>{register.isPending ? "Confirm in your wallet…" : registerReceipt.isLoading ? "Registering…" : "Complete registration"}</button>}
            </>)}
        </ol>}

        <aside className="wz-summary">
          <small>SUMMARY</small>
          <h3>Membership</h3>
          <dl>
            <div><dt>Wallet</dt><dd>{shortAddress(address)}</dd></div>
            <div><dt>Network</dt><dd><i className={address && onRequiredChain ? "online" : ""}/>{address ? (onRequiredChain ? networkName : "Wrong network") : "—"}</dd></div>
            <div><dt>Sponsor</dt><dd>{validSponsor ? shortAddress(sponsor) : "Not verified"}</dd></div>
          </dl>
          <ul className="wz-split">{allocation.map(a => <li key={a.name}><span><i className={a.tone}/>{a.name}</span><b>{a.value}.00</b></li>)}</ul>
          <div className="review-total"><span>Total</span><b>{price} USDT</b></div>
          <p className="wz-note"><ShieldCheck size={15}/> Enforced by the contract. If any rule fails, nothing is charged.</p>
          {lastTx && <a className="wz-link" href={`${explorerUrl}/tx/${lastTx}`} target="_blank" rel="noreferrer">View latest transaction <ExternalLink size={12}/></a>}
        </aside>
      </div>
    </section>
  </motion.div>;
}

const rankNames = ["Member", "1 Star", "2 Star", "3 Star", "4 Star", "5 Star"];
const royaltyClubs = [
  { rank: 1, name: rankNames[1], requirement: "Registered member", cap: "2× ticket", reward: "3% royalty" },
  { rank: 2, name: rankNames[2], requirement: "4 direct referrals", cap: "5× ticket", reward: "3% royalty" },
  { rank: 3, name: rankNames[3], requirement: "16 members at Level 2", cap: "10× ticket", reward: "3% royalty" },
  { rank: 4, name: rankNames[4], requirement: "64 members at Level 3", cap: "50× ticket", reward: "3% royalty" },
  { rank: 5, name: rankNames[5], requirement: "300 members at Level 4", cap: "Unlimited", reward: "3% royalty" },
  { rank: null, name: "Superstar", requirement: "Week's top recruiter with 5+ directs", cap: "Weekly", reward: "Superstar fund" },
];

const isMember = (participant?: { id: bigint }) => Boolean(participant?.id);

/** Mirrors `claim()` using the contract's ROYALTY_BPS and DEVELOPMENT_BPS. */
function claimFees(gross: bigint | undefined, rules: ProtocolRules) {
  const value = gross ?? 0n;
  const royalty = value * rules.royaltyBps / 10_000n;
  const development = value * rules.developmentBps / 10_000n;
  return { royalty, development, net: value - royalty - development };
}
const pct = (bps: bigint) => `${Number(bps) / 100}%`;
/** Rank requirement and cap text built from the contract's `rankRule`. */
function rankRequirementText(rank: number, rule: RankRule) {
  if (rule.directs === 0 && rule.qualifiedLevel === 0) return rank === 1 ? "Registered member" : "No requirement";
  if (rule.qualifiedLevel === 0) return `${rule.directs} direct referrals`;
  return `${rule.qualifiedCount.toLocaleString()} members at team level ${rule.qualifiedLevel}`;
}
const rankCapText = (rule: RankRule) => rule.capMultiple === null ? "Unlimited" : `${rule.capMultiple}× ticket`;

const streamIcons: Record<string, typeof Users> = {
  DIRECT_INCOME: Users, TEN_LEVEL_UPLINE: Layers, MATRIX_INCOME: LayoutGrid, NONWORKING_U1: UserRoundCheck, NONWORKING_UPLINE: Network,
  REENTRY: Zap, WEEKLY_SUPERSTAR: Award, SINGLE_LEG_INCOME: TrendingUp, WORKING_LEVEL_INCOME: Layers,
  NON_WORKING_MATRIX_INCOME: Network, FIVE_STAR_ROYALTY: ShieldCheck, STAR_CLUB_ROYALTY: Crown,
};
const streamIcon = (reason: string) => streamIcons[reason] ?? Coins;

const MAX_UINT = 2n ** 256n - 1n;
type PoolStatus = "empty" | "ready" | "cap" | "reserve";

/**
 * Mirrors `settlePoolRewards()`: each pool is paid in full or not at all, in the order
 * Single-Leg → Working → Non-Working, limited by the remaining rank cap and the pool reserve.
 */
/** Mirrors `settlePoolRewards`: Single-Leg, Working, then Non-Working, each paid in full from its own reserve within the rank cap. */
function previewSettlement(input: { single?: bigint; working?: bigint; nonWorking?: bigint; cap?: bigint; settled?: bigint; singleLegReserve?: bigint; workingReserve?: bigint; nonWorkingReserve?: bigint }) {
  const cap = input.cap ?? 0n;
  const settled = input.settled ?? 0n;
  const unlimited = cap === MAX_UINT;
  let capacity = unlimited ? MAX_UINT : cap > settled ? cap - settled : 0n;
  const reserves = { single: input.singleLegReserve ?? 0n, working: input.workingReserve ?? 0n, nonWorking: input.nonWorkingReserve ?? 0n };
  const pools = ([["single", input.single], ["working", input.working], ["nonWorking", input.nonWorking]] as const).map(([key, raw]) => {
    const amount = raw ?? 0n;
    const reserve = reserves[key];
    let status: PoolStatus = "ready";
    if (amount === 0n) status = "empty";
    else if (amount > capacity) status = "cap";
    else if (amount > reserve) status = "reserve";
    if (status === "ready" && !unlimited) capacity -= amount;
    return { key, amount, status };
  });
  const waiting = pools.reduce((sum, p) => sum + p.amount, 0n);
  const movable = pools.filter(p => p.status === "ready").reduce((sum, p) => sum + p.amount, 0n);
  return { pools, waiting, movable, settled, cap, unlimited, capLeft: unlimited ? MAX_UINT : cap > settled ? cap - settled : 0n, earned: waiting + settled, loaded: input.cap !== undefined };
}

function txErrorMessage(error: Error | null, action: string) {
  if (!error) return undefined;
  if (/user rejected|user denied/i.test(error.message)) return `${action} was cancelled in your wallet.`;
  if (/insufficient funds|gas required exceeds/i.test(error.message)) return "Your wallet needs a little BNB to pay the network fee.";
  if (/current chain.*does not match|chain mismatch/i.test(error.message)) return "Switch your wallet to the correct network and try again.";
  return error.message.split("\n")[0];
}

function Referrals({ address, participant, onParticipate }: { address?: Address; participant?: { id: bigint; directCount: bigint; sponsor: Address; joinedAt: bigint }; onParticipate: () => void }) {
  const account = address ?? zeroAddress;
  const currentWeek = BigInt(Math.floor(Date.now() / 1000 / (7 * 24 * 60 * 60)));
  const rewards = useReadContracts({
    contracts: protocolAddress ? [
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "withdrawable", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "teamCount", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "workingLevel", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "nonWorkingLevel", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "starRank", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "matrixParent", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "pendingSingleLegIncome", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "pendingWorkingPoolIncome", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "pendingNonWorkingPoolIncome", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "singleLegLevel", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "claimable", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "pendingFiveStarReward", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "autoUpgradeCredit", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "poolRewardCap", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "rankedPoolRewardsCredited", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "singleLegReserve" },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "nonWorkingReserve" },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "workingReentries", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "nonWorkingReentries", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "fiveStarWeight", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "weeklyDirects", args: [currentWeek, account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "weeklyCompetition", args: [currentWeek] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "singleLegEntries", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "singleLegReentries", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "nonWorkingEntryCredit", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "qualifiedLevelTeamCount", args: [account, 2] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "qualifiedLevelTeamCount", args: [account, 3] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "qualifiedLevelTeamCount", args: [account, 4] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "superstarReserve" },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "pendingClubReward", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "clubMemberCount", args: [1] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "clubMemberCount", args: [2] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "clubMemberCount", args: [3] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "clubMemberCount", args: [4] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "fiveStarCount" },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "getLevelTeamCounts", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "heldRoyalty", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "royaltyClaimable", args: [account] },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "workingReserve" },
      ...[1, 2, 3, 4].map(rank => ({ address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "accClubRewardPerMember" as const, args: [rank] as const })),
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "accFiveStarRewardPerMember" },
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
  const pendingSingleLeg = rewards.data?.[6]?.result as bigint | undefined;
  const pendingWorking = rewards.data?.[7]?.result as bigint | undefined;
  const pendingNonWorking = rewards.data?.[8]?.result as bigint | undefined;
  const queued = (pendingSingleLeg ?? 0n) + (pendingWorking ?? 0n) + (pendingNonWorking ?? 0n);
  const singleLeg = rewards.data?.[9]?.result as number | undefined;
  const creditedIncome = rewards.data?.[10]?.result as bigint | undefined;
  const pendingFiveStar = rewards.data?.[11]?.result as bigint | undefined;
  const heldForUpgrade = rewards.data?.[12]?.result as bigint | undefined;
  const teamIncome = previewSettlement({
    single: pendingSingleLeg, working: pendingWorking, nonWorking: pendingNonWorking,
    cap: rewards.data?.[13]?.result as bigint | undefined,
    settled: rewards.data?.[14]?.result as bigint | undefined,
    singleLegReserve: rewards.data?.[15]?.result as bigint | undefined,
    workingReserve: rewards.data?.[38]?.result as bigint | undefined,
    nonWorkingReserve: rewards.data?.[16]?.result as bigint | undefined,
  });
  const rules = useProtocolRules();
  // Event history (transaction links) still comes from the indexer; every total is read from the contract.
  const indexedHistory = useIncomeHistory(isMember(participant) ? address : undefined);
  const history = useOnchainIncome(isMember(participant) ? address : undefined, rules, indexedHistory.data?.recent);
  const directReferrals = useOnchainDirects(isMember(participant) ? address : undefined);
  // Single-Leg is one global line: your team is everyone who joined after your position.
  const singleLegLine = useSingleLegLine(isMember(participant) ? address : undefined);
  const slTeam = singleLegLine.data?.team;
  const nonWorkingReentries = rewards.data?.[18]?.result as bigint | undefined;
  const fiveStarWeight = rewards.data?.[19]?.result as bigint | undefined;
  const weeklyDirects = rewards.data?.[20]?.result as bigint | undefined;
  const weeklyCompetition = rewards.data?.[21]?.result as readonly [Address, bigint, boolean] | undefined;
  const isWeeklyLeader = Boolean(weeklyCompetition && weeklyCompetition[0] !== zeroAddress && weeklyCompetition[0].toLowerCase() === address?.toLowerCase() && weeklyCompetition[1] >= BigInt(rules.superstarMinDirects));
  const superstarMin = rules.superstarMinDirects;
  const singleLegEntries = rewards.data?.[22]?.result as bigint | undefined;
  const singleLegReentries = rewards.data?.[23]?.result as bigint | undefined;
  const nonWorkingEntryCredit = rewards.data?.[24]?.result as bigint | undefined;
  const qualifiedLevel2 = rewards.data?.[25]?.result as bigint | undefined;
  const qualifiedLevel3 = rewards.data?.[26]?.result as bigint | undefined;
  const qualifiedLevel4 = rewards.data?.[27]?.result as bigint | undefined;
  const superstarReserve = rewards.data?.[28]?.result as bigint | undefined;
  const pendingClub = rewards.data?.[29]?.result as bigint | undefined;
  const clubMembers = [30, 31, 32, 33, 34].map(i => rewards.data?.[i]?.result as bigint | undefined);
  const levelTeam = rewards.data?.[35]?.result as readonly bigint[] | undefined;
  // Non-Working levels count only after entering at Single-Leg Level 1 (ignores levels stored under the old rule).
  // Every member enters Non-Working on joining; it is independent of Single-Leg.
  const nonWorkingShown = nonWorking ?? 0;
  const heldRoyalty = rewards.data?.[36]?.result as bigint | undefined;
  const royaltyClaimable = rewards.data?.[37]?.result as boolean | undefined;
  const accClub = [39, 40, 41, 42].map(i => rewards.data?.[i]?.result as bigint | undefined);
  const accFiveStar = rewards.data?.[43]?.result as bigint | undefined;
  const clubFunds = useClubFunds();
  const pendingRoyalty = pendingFiveStar === undefined && pendingClub === undefined ? undefined : (pendingFiveStar ?? 0n) + (pendingClub ?? 0n) + (heldRoyalty ?? 0n);
  useEffect(() => { if (claimReceipt.isSuccess || settleReceipt.isSuccess) { void history.refetch(); void indexedHistory.refetch(); } }, [claimReceipt.isSuccess, settleReceipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps
  void creditedIncome;
  const historyAmount = (reason: string) => history.data ? BigInt(history.data.totals[reason]?.amount ?? "0") : undefined;

  const [tab, setTab] = useState<"overview" | "earnings" | "network" | "royalty" | "ledger">("overview");
  const [openStream, setOpenStream] = useState<string>();
  const [ledgerReason, setLedgerReason] = useState<string>();
  const [copied, setCopied] = useState<"link" | "address">();
  const [networkView, setNetworkView] = useState<"working" | "nonworking" | "single" | "reentry">("working");
  const link = address ? `${location.origin}${location.pathname}?ref=${address}` : "";
  const copyText = (value: string, kind: "link" | "address") => { void navigator.clipboard.writeText(value); setCopied(kind); setTimeout(() => setCopied(undefined), 1600); };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: "Join me on Open Protocol", text: "Join my team on Open Protocol.", url: link }); } catch { /* dismissed */ } }
    else copyText(link, "link");
  };
  const shareText = encodeURIComponent(`Join my team on Open Protocol: ${link}`);

  const registered = Boolean(participant?.id);
  const isActive = Number(participant?.directCount ?? 0n) >= rules.activationDirects;
  const fees = claimFees(withdrawable, rules);
  const joined = participant?.joinedAt ? new Date(Number(participant.joinedAt) * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
  const directCount = Number(participant?.directCount ?? 0n);
  const teamCount = Number(team ?? 0n);
  const currentRank = rank ?? 0;
  const nextRank = Math.min(5, currentRank + 1);
  const topRank = currentRank >= 5;
  // Star ranks count members at a referral-tree level (contract `levelTeamCount`): level 2 = your directs' directs.
  const qualifiedAt = (level: number) => Number(levelTeam?.[level - 1] ?? 0n);
  const nextRule = rules.ranks[Math.max(2, nextRank)];
  const rankRequirement = nextRule.qualifiedLevel === 0
    ? { label: "Direct referrals", value: directCount, target: Math.max(1, nextRule.directs), detail: `${nextRule.directs} personal referrals` }
    : { label: `Level ${nextRule.qualifiedLevel} members`, value: qualifiedAt(nextRule.qualifiedLevel), target: Math.max(1, nextRule.qualifiedCount), detail: `Members ${nextRule.qualifiedLevel} levels down your referral tree, from any of your directs. Club income is claimable with ${rules.clubClaimDirects[nextRank]} directs.` };
  const topRule = rules.ranks[5];
  const rankProgress = topRank ? 100 : Math.min(100, rankRequirement.value / rankRequirement.target * 100);
  const activationProgress = Math.min(100, directCount / Math.max(1, rules.activationDirects) * 100);
  const networkName = requiredChainId === 97 ? "BSC Testnet" : "BNB Smart Chain";
  const weekEnds = new Date(Number((currentWeek + 1n) * 7n * 24n * 60n * 60n) * 1000).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const capLabel = rankCapText(rules.ranks[Math.max(1, Math.min(5, currentRank))]);
  const claimBusy = claim.isPending || claimReceipt.isLoading;
  const settleBusy = settle.isPending || settleReceipt.isLoading;
  const actionError = txErrorMessage(claim.error, "Withdrawal") ?? txErrorMessage(settle.error, "Settlement");
  const doClaim = () => { claim.reset(); claim.writeContract({ address: protocolAddress!, abi: protocolAbi, functionName: "claim", chainId: requiredChainId }); };
  const doSettle = () => { settle.reset(); settle.writeContract({ address: protocolAddress!, abi: protocolAbi, functionName: "settlePoolRewards", chainId: requiredChainId }); };

  if (!address || !registered) {
    return <motion.div {...fade}>
      <section className="db-empty-wrap"><div className="wrap db-empty">
        <span className="db-empty-icon">{address ? <UserRoundCheck size={26}/> : <WalletCards size={26}/>}</span>
        <h1>{address ? "Join to unlock your dashboard" : "Connect to view your dashboard"}</h1>
        <p>{address ? "This wallet isn't a member yet. Registration takes about three minutes, and your dashboard opens as soon as it's done." : "Your balance, referral link, team and rank progress all live here. Connect the wallet you registered with."}</p>
        {address ? <button className="pill" onClick={onParticipate}>Start registration <ArrowRight size={16}/></button> : <ConnectButton label="Connect wallet" accountStatus="address" chainStatus="none" showBalance={false}/>}
        <div className="db-empty-perks">
          <div><Wallet size={18}/><b>Live balance</b><span>Withdraw rewards in one click</span></div>
          <div><Share2 size={18}/><b>Referral link</b><span>Invite and track your directs</span></div>
          <div><Award size={18}/><b>Rank progress</b><span>See exactly what's next</span></div>
        </div>
      </div></section>
    </motion.div>;
  }

  const tabs = [["overview", "Overview", LayoutGrid], ["earnings", "Earnings", TrendingUp], ["network", "Network", Network], ["royalty", "Royalty Income", Crown], ["ledger", "Income Ledger", WalletCards]] as const;
  const poolInfo = {
    single: { name: "Single-Leg", note: "Team size + direct referral milestones", tone: "blue", Icon: TrendingUp, level: singleLeg ?? 0, max: 10 },
    working: { name: "Working", note: "Each level fills with entries from your team", tone: "green", Icon: Layers, level: working ?? 0, max: 15 },
    nonWorking: { name: "Non-Working", note: "Each level fills with entries from your team", tone: "purple", Icon: Network, level: nonWorkingShown, max: 15 },
  } as const;
  const visiblePools = teamIncome.pools;
  const nextCapRank = rankNames.findIndex((_, index) => index > currentRank && index <= 5);
  const statusLabel = (status: PoolStatus) => status === "ready" ? "Ready" : status === "cap" ? "Over cap" : status === "reserve" ? "Awaiting reserve" : "Not started";
  const blockedReason = teamIncome.movable > 0n || teamIncome.waiting === 0n ? undefined
    : teamIncome.pools.some(p => p.status === "cap")
      ? `Your ${rankNames[currentRank]} cap allows ${formatToken(teamIncome.capLeft)} USDT more, and each pool is paid out in full or not at all.${nextCapRank > 0 ? ` Reach ${rankNames[nextCapRank]} to raise your cap.` : ""}`
      : "The pool reserve can't cover this yet. It refills as new members join.";
  const settleLabel = settle.isPending ? "Confirm in wallet…" : settleReceipt.isLoading ? "Settling…" : teamIncome.movable > 0n ? `Move ${formatToken(teamIncome.movable)} USDT to balance` : "Move to balance";
  const settleDisabled = teamIncome.movable === 0n || settleBusy;
  const capPercent = teamIncome.unlimited ? 100 : teamIncome.cap ? Math.min(100, Number(teamIncome.settled * 10_000n / teamIncome.cap) / 100) : 0;
  const portion = (value: bigint) => teamIncome.earned ? Number(value * 10_000n / teamIncome.earned) / 100 : 0;
  const ring = 2 * Math.PI * 44;
  const streamRows = [
    ...incomeStreams.map(stream => ({ ...stream, amount: historyAmount(stream.reason) ?? 0n, count: history.data?.totals[stream.reason]?.count ?? 0 })),
    ...(history.data && history.data.earlier > 0n ? [{ reason: "EARLIER", name: "Earlier income", note: "Credited before the contract kept per-source totals", amount: history.data.earlier, count: 0 }] : []),
  ];
  const earnedStreams = streamRows.filter(row => row.amount > 0n).sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
  const idleStreams = streamRows.filter(row => row.amount === 0n);
  const sourceTotal = earnedStreams.reduce((sum, row) => sum + row.amount, 0n);
  const royaltyLifetime = (historyAmount("FIVE_STAR_ROYALTY") ?? 0n) + (historyAmount("STAR_CLUB_ROYALTY") ?? 0n);
  const royaltyPayments = (history.data?.totals.FIVE_STAR_ROYALTY?.count ?? 0) + (history.data?.totals.STAR_CLUB_ROYALTY?.count ?? 0);
  const royaltyActivity = history.data?.recent.filter(item => item.reason === "FIVE_STAR_ROYALTY" || item.reason === "STAR_CLUB_ROYALTY") ?? [];
  const teamIncomeCard = <section className="ti">
    <div className="ti-hero">
      <div className="ti-headline">
        <span className="ti-eyebrow"><i/> TEAM INCOME</span>
        <b className="ti-total">{formatToken(teamIncome.earned)}<em>USDT</em></b>
        <p>Earned from Single-Leg and the Non-Working Matrix. {teamIncome.waiting > 0n ? <><b>{formatToken(teamIncome.waiting)} USDT</b> is still in reserves.</> : "It appears here as your team reaches new levels."}</p>
        <div className="ti-split" aria-label="Team income breakdown">
          {teamIncome.pools.map(pool => pool.amount > 0n && <i key={pool.key} className={poolInfo[pool.key].tone} style={{ width: `${portion(pool.amount)}%` }}/>)}
          {teamIncome.settled > 0n && <i className="settled" style={{ width: `${portion(teamIncome.settled)}%` }}/>}
        </div>
        <div className="ti-legend">
          {teamIncome.pools.map(pool => <span key={pool.key}><i className={poolInfo[pool.key].tone}/>{poolInfo[pool.key].name} <b>{formatToken(pool.amount)}</b></span>)}
          <span><i className="settled"/>In balance <b>{formatToken(teamIncome.settled)}</b></span>
        </div>
      </div>
      <div className="ti-cap">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <defs><linearGradient id="tiRing" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#179cff"/><stop offset=".6" stopColor="#32d7ff"/><stop offset="1" stopColor="#f4ba3e"/></linearGradient></defs>
          <circle cx="50" cy="50" r="44" className="track"/>
          <circle cx="50" cy="50" r="44" className="value" strokeDasharray={ring} strokeDashoffset={ring * (1 - capPercent / 100)}/>
        </svg>
        <div className="ti-cap-text"><small>EARNINGS CAP</small><b>{teamIncome.unlimited ? "∞" : `${Math.round(capPercent)}%`}</b><span>{teamIncome.unlimited ? "No limit" : `${formatToken(teamIncome.settled)} / ${formatToken(teamIncome.cap)}`}</span></div>
        <span className="ti-rank"><Award size={12}/> {rankNames[currentRank]}</span>
      </div>
    </div>

    <div className="ti-pools">{teamIncome.pools.map(pool => { const info = poolInfo[pool.key]; const Icon = info.Icon; return <article key={pool.key} className={`ti-pool ${info.tone} ${pool.amount ? "" : "is-empty"}`}>
      <div className="ti-pool-head"><span className="ti-icon"><Icon size={16}/></span><div><b>{info.name} Pool</b><small>{info.note}</small></div></div>
      <div className="ti-amount">{formatToken(pool.amount)}<em>USDT</em></div>
      <div className="ti-level"><div><span>Level {info.level} of {info.max}</span><span className={`ti-status ${pool.status}`}>{pool.status === "ready" ? <Check size={11}/> : pool.status === "empty" ? null : <Lock size={11}/>} {statusLabel(pool.status)}</span></div><div className="ti-track"><i style={{ width: `${info.level / info.max * 100}%` }}/></div></div>
    </article>; })}</div>

    <div className={`ti-action ${teamIncome.movable > 0n ? "ready" : blockedReason ? "locked" : ""}`}>
      <span className="ti-action-icon">{teamIncome.movable > 0n ? <Zap size={17}/> : blockedReason ? <Lock size={17}/> : <Clock size={17}/>}</span>
      <div><b>{teamIncome.movable > 0n ? `${formatToken(teamIncome.movable)} USDT is ready to move` : blockedReason ? "Team income is locked for now" : "Nothing to move yet"}</b><p>{blockedReason ?? (teamIncome.movable > 0n ? "Move it to your balance, then withdraw to your wallet." : "Your share (80% own, 10% U1, 10% across U2–U9) is added when your team reaches new levels.")}</p></div>
      <button className="pill" disabled={settleDisabled} onClick={doSettle}>{settleLabel}</button>
    </div>
  </section>;

  return <motion.div {...fade}>
    <section className="db-head">
      <div className="wrap-wide">
        <div className="db-head-row">
          <div>
            <div className={`db-status ${isActive ? "" : "inactive"}`}><i/> {isActive ? "Active member" : "Inactive · refer 2 members to activate"} · {networkName}</div>
            <h1>Welcome back, <span className="grad">Member #{participant!.id.toString()}</span></h1>
            <div className="db-meta">
              <button className="db-chip mono" onClick={() => copyText(address, "address")} title="Copy wallet address">{shortAddress(address)} {copied === "address" ? <Check size={13}/> : <Copy size={13}/>}</button>
              <span className="db-chip"><Award size={13}/> {rankNames[currentRank]}</span>
              <span className="db-chip"><Calendar size={13}/> Joined {joined}</span>
            </div>
          </div>
          <a className="db-explorer" href={`${explorerUrl}/address/${address}`} target="_blank" rel="noreferrer">View on explorer <ExternalLink size={13}/></a>
        </div>
        <div className="db-tabs" role="tablist">{tabs.map(([key, label, Icon]) => <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}><Icon size={15}/> {label}</button>)}</div>
      </div>
    </section>

    <section className="db-body"><div className="wrap-wide">
      {tab === "overview" && <div className="db-stack">
        {!isActive && <div className="db-alert"><span><Zap size={18}/></span><div><b>Refer {rules.activationDirects - directCount} more {rules.activationDirects - directCount === 1 ? "member" : "members"} to activate your income</b><p>Your 1st direct pays you {formatToken(rules.workingAllocation * rules.directShareBps / 10_000n)} USDT. Your {rules.upgradeDirect === 2 ? "2nd" : `#${rules.upgradeDirect}`} direct's {formatToken(rules.workingAllocation)} USDT is your auto-upgrade into Working Level 2, and every direct after that pays you again. Ten-level upline income starts at {rules.activationDirects} direct referrals.</p></div><button className="db-btn" onClick={() => copyText(link, "link")}>{copied === "link" ? "Link copied" : "Copy invite link"}</button></div>}
        <div className="db-hero-grid">
          <div className="db-balance">
            <div className="db-balance-top"><span>Available balance</span><span className="db-live"><i/> Live</span></div>
            <b className="db-balance-value">{formatToken(withdrawable)} <em>USDT</em></b>
            <p className="db-balance-sub">{withdrawable ? <>You receive <b>{formatToken(fees.net)} USDT</b> after the {pct(rules.royaltyBps + rules.developmentBps)} withdrawal fee.</> : "New rewards are added here automatically."}</p>
            <button className="pill db-withdraw" disabled={!withdrawable || claimBusy} onClick={doClaim}>{claim.isPending ? "Confirm in wallet…" : claimReceipt.isLoading ? "Withdrawing…" : claimReceipt.isSuccess ? "Withdrawn" : "Withdraw to wallet"} {!claimBusy && <ArrowUpRight size={16}/>}</button>
            <div className="db-pending">
              <div><small><Clock size={12}/> Team income in pools</small><b>{formatToken(queued)} USDT</b></div>
              <button className="db-btn" disabled={settleBusy || queued === 0n} onClick={teamIncome.movable > 0n ? doSettle : () => setTab("earnings")}>{teamIncome.movable > 0n || settleBusy ? settleLabel : queued > 0n ? "Why is it locked?" : "Move to balance"}</button>
            </div>
            {actionError && <p className="db-error">{actionError}</p>}
          </div>

          <div className="db-card db-invite">
            <div className="db-card-head"><span className="db-icon"><Share2 size={18}/></span><div><h3>Invite & grow</h3><p>Everyone who joins with your link becomes your direct referral, permanently.</p></div></div>
            <div className="db-link"><code>{link}</code><button onClick={() => copyText(link, "link")}>{copied === "link" ? <><Check size={14}/> Copied</> : <><Copy size={14}/> Copy</>}</button></div>
            <div className="db-share">
              <button onClick={share}><Share2 size={14}/> Share</button>
              <a href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noreferrer"><MessageCircle size={14}/> WhatsApp</a>
              <a href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Join my team on Open Protocol")}`} target="_blank" rel="noreferrer"><Send size={14}/> Telegram</a>
            </div>
            <div className="db-invite-foot"><div><span>Your sponsor</span><b className="mono">{participant!.sponsor === zeroAddress ? "Genesis" : shortAddress(participant!.sponsor)}</b></div><div><span>Your member ID</span><b>#{participant!.id.toString()}</b></div></div>
          </div>
        </div>

        <div className="db-kpis">
          <article><span className="db-icon"><Users size={17}/></span><small>Direct referrals</small><b>{directCount}</b><em>{isActive ? "Working Matrix income active" : `${rules.activationDirects - directCount} more to activate income`}</em><div className="kpi-bar"><i style={{ width: `${activationProgress}%` }}/></div></article>
          <article><span className="db-icon"><Network size={17}/></span><small>{topRank ? `Level ${topRule.qualifiedLevel} team` : rankRequirement.label}</small><b>{topRank ? qualifiedAt(topRule.qualifiedLevel).toLocaleString() : rankRequirement.value.toLocaleString()}</b><em>{topRank ? "Five-Star qualification complete" : `${Math.max(0, rankRequirement.target - rankRequirement.value)} more for ${rankNames[nextRank]}`}</em><div className="kpi-bar"><i style={{ width: `${rankProgress}%` }}/></div></article>
          <article><span className="db-icon"><Award size={17}/></span><small>Current rank</small><b>{rankNames[currentRank]}</b><em>{topRank ? "Highest rank" : `${Math.round(rankProgress)}% to ${rankNames[nextRank]}`}</em><div className="kpi-bar"><i style={{ width: `${rankProgress}%` }}/></div></article>
          <article className="clickable" onClick={() => setTab("earnings")}><span className="db-icon"><Layers size={17}/></span><small>Matrix income</small><b>{formatToken(teamIncome.earned)}<i> USDT</i></b><em>Single-Leg {singleLeg ?? 0}/10 · {singleLegEntries?.toString() ?? 1} entries</em><div className="kpi-bar"><i style={{ width: `${(singleLeg ?? 0) / 10 * 100}%` }}/></div></article>
        </div>

        <div className="db-card team-levels">
          <div className="db-section-head"><div><small>TEAM OVERVIEW</small><h3>Your team</h3></div></div>
          <div className="team-levels-body">
            <div className="team-total"><span className="db-icon"><Users size={18}/></span><small>Total team</small><b>{team === undefined ? "—" : teamCount.toLocaleString()}</b><em>{directCount.toLocaleString()} direct · {Math.max(0, teamCount - directCount).toLocaleString()} indirect</em></div>
            <div className="team-level-grid">{Array.from({ length: 4 }, (_, index) => {
              const count = levelTeam?.[index];
              const value = Number(count ?? 0n);
              const peak = Math.max(1, ...(levelTeam ?? []).slice(0, 4).map(Number));
              return <div key={index} className={value > 0 ? "has" : ""}>
                <small>Level {index + 1}</small>
                <b>{count === undefined ? "—" : value.toLocaleString()}</b>
                <span>{index === 0 ? "Directs" : `${index + 1} levels down`}</span>
                <i><em style={{ width: `${value / peak * 100}%` }}/></i>
              </div>;
            })}
            </div>
          </div>
          {levelTeam === undefined && <p className="db-foot-note">Level counts appear once the contract upgrade with per-level team tracking is live.</p>}
        </div>

        {(() => {
          const level = singleLeg ?? 0;
          const done = level >= 10;
          const [nextMembers, nextDirects] = SINGLE_LEG_TABLE[Math.min(level, 9)];
          const prevMembers = level === 0 ? 0 : SINGLE_LEG_TABLE[level - 1][0];
          // Level 1 counts everyone after you; Level L counts people after you who reached Level L-1.
          void prevMembers;
          const met = level === 0 ? (slTeam ?? 0) >= nextMembers : Boolean(singleLegLine.data?.metAt[level + 1]);
          const counted = level === 0 ? (slTeam ?? 0) : met ? nextMembers : 0;
          const progress = done ? 100 : Math.min(100, counted / nextMembers * 100);
          return <div className="db-card single-leg-card">
            <div className="db-section-head"><div><small>SINGLE-LEG POOL</small><h3>Single-Leg team</h3></div><button className="db-text-btn" onClick={() => setTab("network")}>View <ChevronRight size={14}/></button></div>
            <div className="single-leg-body">
              <div className="team-total sl"><span className="db-icon"><TrendingUp size={18}/></span><small>Single-Leg team</small><b>{slTeam === undefined ? "—" : slTeam.toLocaleString()}</b><em>Everyone who joined after you · position #{singleLegLine.data?.primary ?? "—"}</em></div>
              <div className="single-leg-stats">
                <div><small>Current level</small><b>{level} <i>/ 10</i></b></div>
                <div><small>Next level needs</small><b>{done ? "—" : level === 0 ? `${nextMembers.toLocaleString()} after you` : `${nextMembers.toLocaleString()} at Level ${level}+`}</b><span>{done ? "All levels complete" : level === 0 ? `${Math.max(0, nextMembers - counted).toLocaleString()} more people` : met ? "Members condition met" : `People after you must reach Level ${level}`}</span></div>
                <div><small>Directs required</small><b>{done ? "—" : nextDirects}</b><span>{done ? "" : directCount >= nextDirects ? "Requirement met" : `You have ${directCount}`}</span></div>
              </div>
            </div>
            <div className="single-leg-progress"><div><span>{done ? "Single-Leg Level 10 complete" : `Progress to Level ${level + 1}`}</span><b>{Math.round(progress)}%</b></div><i><em style={{ width: `${progress}%` }}/></i></div>
          </div>;
        })()}

        <MyTeam address={address}/>

        <div className="db-two">
          <div className="db-card">
            <div className="db-section-head"><div><small>RANK PROGRESS</small><h3>{topRank ? "You've reached 5 Star" : `On your way to ${rankNames[nextRank]}`}</h3></div><b className="db-percent">{Math.round(rankProgress)}%</b></div>
            <div className="db-ranks">{rankNames.map((name, index) => <div key={name} className={index <= currentRank ? "reached" : index === nextRank && !topRank ? "next" : ""}><i>{index <= currentRank ? <Check size={11}/> : null}</i><span>{name}</span></div>)}</div>
            {!topRank && <div className="db-reqs">
              <div><div><span>{rankRequirement.label}</span><b>{Math.min(rankRequirement.value, rankRequirement.target)} / {rankRequirement.target}</b></div><div className="db-bar"><i style={{ width: `${rankProgress}%` }}/></div><small>{rankRequirement.value >= rankRequirement.target ? "Done" : `${rankRequirement.target - rankRequirement.value} more needed`}</small></div>
              <p className="db-foot-note">{rankRequirement.detail}</p>
            </div>}
            <p className="db-foot-note">{topRank ? "Your Royalty Club income keeps growing with your team." : "Both requirements must be met before the contract upgrades your rank."}</p>
          </div>

          <div className="db-card">
            <div className="db-section-head"><div><small>EARNINGS SNAPSHOT</small><h3>Where your rewards are</h3></div><button className="db-text-btn" onClick={() => setTab("earnings")}>Details <ChevronRight size={14}/></button></div>
            <ul className="db-rows db-snap">
              <li><span><em className="snap-icon green"><Wallet size={14}/></em>Available to withdraw</span><b>{formatToken(withdrawable)} <small>USDT</small></b></li>
              <li><span><em className="snap-icon blue"><Layers size={14}/></em>Team income in pools</span><b>{formatToken(queued)} <small>USDT</small></b></li>
              <li><span><em className="snap-icon purple"><Award size={14}/></em>Royalty Club income</span><b>{formatToken(pendingRoyalty)} <small>USDT</small></b></li>
            </ul>
            <div className="db-placement"><span>Your team</span><b>{team === undefined ? "—" : teamCount.toLocaleString()} members</b><button className="db-text-btn" onClick={() => setTab("network")}>View network <ChevronRight size={14}/></button></div>
          </div>
        </div>

        <div className="db-lifecycle">
          <article><span className="db-icon"><Zap size={16}/></span><small>Single-Leg entries</small><b>{singleLegEntries?.toString() ?? "—"}</b><em>{singleLegReentries?.toString() ?? "0"} automatic re-entry at Level 3</em></article>
          <article><span className="db-icon"><Network size={16}/></span><small>Non-working re-entry</small><b>{nonWorkingReentries?.toString() ?? "—"}</b><em>One cycle per 30 qualified team members</em></article>
          <article><span className="db-icon"><Award size={16}/></span><small>Non-Working level</small><b>{nonWorkingShown} <i>/ 15</i></b><em>Entered on joining with your 5 USDT · levels fill with your team's entries</em></article>
          <article><span className="db-icon"><ShieldCheck size={16}/></span><small>Pool earning cap</small><b>{capLabel}</b><em>{teamIncome.unlimited ? "No pool cap at this rank" : `${formatToken(teamIncome.capLeft)} USDT capacity remaining`}</em></article>
        </div>

        <div className="db-two">
          <div className="db-card db-directs">
            <div className="db-section-head"><div><small>DIRECT REFERRALS</small><h3>Your personally invited members</h3></div><span className="db-tag">{directReferrals.data?.length ?? directCount}</span></div>
            {directReferrals.isLoading && <p className="db-foot-note">Loading indexed referrals…</p>}
            {directReferrals.isError && <p className="db-warn">Couldn't read your referral list from the contract right now. Your on-chain count is {directCount}.</p>}
            {directReferrals.data?.length === 0 && <p className="db-empty-note">No direct members yet. Share your personal invitation link to begin.</p>}
            {directReferrals.data && directReferrals.data.length > 0 && <ul className="direct-list">{directReferrals.data.slice(0, 8).map(member => <li key={member.address}>
              <span><b>Member #{member.memberId}</b><small>{new Date(member.joinedAt).toLocaleDateString()}</small></span>
              <a className="mono" href={`${explorerUrl}/address/${member.address}`} target="_blank" rel="noreferrer">{shortAddress(member.address)} <ExternalLink size={11}/></a>
            </li>)}</ul>}
            {directReferrals.data && directReferrals.data.length > 8 && <p className="db-foot-note">Showing the first 8 of {directReferrals.data.length} direct members.</p>}
          </div>

          <div className="db-card db-weekly">
            <div className="db-section-head"><div><small>WEEKLY SUPERSTAR</small><h3>Current recruiting week</h3></div><span className="db-tag">Week {currentWeek.toString()}</span></div>
            <div className="weekly-score"><div><small>Your directs</small><b>{weeklyDirects?.toString() ?? "—"}</b></div><div><small>Leading score</small><b>{weeklyCompetition?.[1]?.toString() ?? "—"}</b></div></div>
            <ul className="db-rows">
              <li><span>Current leader</span><b className="mono">{!weeklyCompetition || weeklyCompetition[0] === zeroAddress ? "No leader yet" : weeklyCompetition[0].toLowerCase() === address?.toLowerCase() ? "You" : shortAddress(weeklyCompetition[0])}</b></li>
              <li><span>Accumulated $1 fund</span><b>{formatToken(superstarReserve)} USDT</b></li>
              <li><span>Minimum qualification</span><b>5 directs</b></li>
              <li><span>Week ends</span><b>{weekEnds}</b></li>
              <li><span>Status</span><b>{weeklyCompetition?.[2] ? "Closed" : "In progress"}</b></li>
            </ul>
            <p className="db-foot-note">The highest recruiter must reach at least five directs. Ties keep the earliest leader, and unclaimed weekly funds roll forward.</p>
          </div>
        </div>
      </div>}

      {tab === "earnings" && <div className="db-stack">
        <div className="db-summary">
          <div className="primary"><span className="db-sum-icon"><Wallet size={16}/></span><small>Available to withdraw</small><b>{formatToken(withdrawable)} <em>USDT</em></b><span>You receive {formatToken(fees.net)} USDT after fees</span><button className="pill" disabled={!withdrawable || claimBusy} onClick={doClaim}>{claimBusy ? "Withdrawing…" : "Withdraw"} {!claimBusy && <ArrowUpRight size={15}/>}</button></div>
          <div><span className="db-sum-icon"><Layers size={16}/></span><small>Team income in pools</small><b>{formatToken(queued)} <em>USDT</em></b><span>{teamIncome.movable > 0n ? `${formatToken(teamIncome.movable)} USDT can move to your balance now` : queued > 0n ? "Locked. See the Team income card below." : "Grows as your team grows"}</span><button className="db-btn" disabled={settleDisabled} onClick={doSettle}>{settleLabel}</button></div>
          <div><span className="db-sum-icon"><TrendingUp size={16}/></span><small>Lifetime earned</small><b>{history.data ? formatToken(BigInt(history.data.lifetimeCredited)) : "—"} <em>USDT</em></b><span>{history.data ? `${formatToken(BigInt(history.data.claims.net))} USDT received in ${history.data.claims.count} ${history.data.claims.count === 1 ? "withdrawal" : "withdrawals"}` : "History service unavailable"}</span></div>
        </div>
        {actionError && <p className="db-error">{actionError}</p>}

        {teamIncomeCard}

        <div className="db-card db-sources">
          <div className="db-section-head"><div><small>INCOME BY SOURCE</small><h3>Everything you've earned</h3></div>{history.data && <span className="db-tag">{earnedStreams.length} of {incomeStreams.length} sources active</span>}</div>
          {history.isError && <p className="db-warn">Couldn't read your income totals from the contract right now. Your balance above is still accurate.</p>}
          {history.isLoading && <div className="src-skeleton"><i/><i/><i/></div>}
          {earnedStreams.length > 0 && <ul className="src-list">{earnedStreams.map(({ reason, name, note, amount, count }) => { const Icon = streamIcon(reason); const pct = sourceTotal ? Number(amount * 1000n / sourceTotal) / 10 : 0; const open = openStream === reason; return <li key={reason} className={`src-item${open ? " open" : ""}${reason === "EARLIER" ? " static" : ""}`} onClick={() => reason !== "EARLIER" && setOpenStream(open ? undefined : reason)}>
            <span className="src-icon"><Icon size={16}/></span>
            <div className="src-main">
              <div className="src-top"><b>{name}</b><strong>{formatToken(amount)} <em>USDT</em></strong></div>
              <div className="src-bar"><i style={{ width: `${Math.max(pct, 2)}%` }}/></div>
              <div className="src-meta"><span>{note}</span><span>{count} {count === 1 ? "payment" : "payments"} · {pct.toFixed(pct < 10 ? 1 : 0)}%{reason !== "EARLIER" && <ChevronRight size={12} className="src-chevron"/>}</span></div>
              {open && <StreamEntries address={address} reason={reason} onViewAll={() => { setLedgerReason(reason); setTab("ledger"); }}/>}
            </div>
          </li>; })}</ul>}
          {history.data && idleStreams.length > 0 && <div className="src-idle"><small>NOT EARNED YET</small><div>{idleStreams.map(({ reason, name }) => { const Icon = streamIcon(reason); return <span key={reason} title={incomeStreams.find(x => x.reason === reason)?.note}><Icon size={13}/> {name}</span>; })}</div></div>}
          {queued > 0n && <p className="db-foot-note">Plus {formatToken(queued)} USDT of team income still in pools. It's counted here once it moves to your balance.</p>}
          {!isActive && <p className="db-foot-note">Direct and ten-level upline income start once you have 2 direct referrals.{heldForUpgrade ? ` ${formatToken(heldForUpgrade)} USDT has been redirected to the pool reserve so far.` : ""}</p>}
        </div>

        <div className="db-two">
          <div className="db-card db-fee">
            <div className="db-section-head"><div><small>WITHDRAWALS</small><h3>Where each withdrawal goes</h3></div></div>
            <div className="fee-split"><i className="you" style={{ width: pct(10_000n - rules.royaltyBps - rules.developmentBps) }}><span>{pct(10_000n - rules.royaltyBps - rules.developmentBps)}</span></i><i className="club" style={{ width: pct(rules.royaltyBps) }}><span>{pct(rules.royaltyBps)}</span></i><i className="dev" style={{ width: pct(rules.developmentBps) }}/></div>
            <ul className="fee-rows">
              <li><span><i className="you"/>You receive</span><b>{formatToken(fees.net)} USDT</b></li>
              <li><span><i className="club"/>Star clubs · {pct(rules.royaltyBps)}</span><b>{formatToken(fees.royalty)} USDT</b></li>
              <li><span><i className="dev"/>Development fund · {pct(rules.developmentBps)}</span><b>{formatToken(fees.development)} USDT</b></li>
            </ul>
            <div className="fee-total"><span>Next withdrawal</span><b>{formatToken(withdrawable)} <em>USDT</em></b></div>
            {history.data && history.data.claims.count > 0 && <p className="db-foot-note">So far you've withdrawn {formatToken(BigInt(history.data.claims.gross))} USDT and received {formatToken(BigInt(history.data.claims.net))} USDT.</p>}
          </div>
          <div className="db-card db-club">
            <div className="db-section-head"><div><small>ROYALTY CLUB INCOME</small><h3>{currentRank >= 1 ? "You're earning club income" : "Join to earn club income"}</h3></div><span className="club-badge"><Award size={14}/> {rankNames[currentRank]} club</span></div>
            <div className="club-amount"><small>Club income waiting</small><b>{formatToken(pendingRoyalty)} <em>USDT</em></b><span>Your club share is added to your balance automatically when you withdraw</span></div>
            {currentRank < 5 ? <div className="club-reqs">
              <div><div><span>Directs to claim 5 Star income</span><b>{Math.min(directCount, rules.clubClaimDirects[5])} / {rules.clubClaimDirects[5]}</b></div><div className="db-bar"><i style={{ width: `${Math.min(100, directCount / Math.max(1, rules.clubClaimDirects[5]) * 100)}%` }}/></div></div>
              <div><div><span>Level {topRule.qualifiedLevel} members</span><b>{Math.min(qualifiedAt(topRule.qualifiedLevel), topRule.qualifiedCount).toLocaleString()} / {topRule.qualifiedCount.toLocaleString()}</b></div><div className="db-bar"><i style={{ width: `${Math.min(100, qualifiedAt(topRule.qualifiedLevel) / Math.max(1, topRule.qualifiedCount) * 100)}%` }}/></div></div>
            </div> : <p className="db-foot-note">Your share grows with every 1,000 members in your team.</p>}
          </div>
        </div>

        {history.data && history.data.recent.length > 0 && <div className="db-card">
          <div className="db-section-head"><div><small>RECENT ACTIVITY</small><h3>Latest rewards</h3></div><span className="db-tag">Last {Math.min(10, history.data.recent.length)}</span></div>
          <ul className="act-list">{history.data.recent.slice(0, 10).map(item => { const Icon = streamIcon(item.reason); return <li key={`${item.txHash}-${item.reason}-${item.amount}`}>
            <span className="act-icon"><Icon size={15}/></span>
            <div><b>{incomeName(item.reason)}</b><small>Block {Number(item.blockNumber).toLocaleString()} · <span className="mono">{item.txHash.slice(0, 10)}…</span></small></div>
            <a href={`${explorerUrl}/tx/${item.txHash}`} target="_blank" rel="noreferrer">+{formatToken(BigInt(item.amount))} <em>USDT</em> <ExternalLink size={12}/></a>
          </li>; })}</ul>
        </div>}
      </div>}

      {tab === "network" && <div className="tile matrix dashboard-network db-network">
        <div className="db-seg" role="tablist" aria-label="Network system">
          {([["working", "Working Matrix", `${directCount}/2 activation`], ["nonworking", "Non-Working", `Level ${nonWorkingShown}/15`], ["single", "Single Leg", `Level ${singleLeg ?? 0}/10`], ["reentry", "Re-entry", `${singleLegReentries?.toString() ?? "0"} re-entr${singleLegReentries === 1n ? "y" : "ies"}`]] as const).map(([key, label, meta]) => <button key={key} className={networkView === key ? "active" : ""} onClick={() => setNetworkView(key)}><b>{label}</b><span>{meta}</span></button>)}
        </div>
        {networkView === "working" && <><WorkingMatrixView address={address} team={team} workingLevel={working}/><WorkingDistributionPanel directs={directCount} heldForUpgrade={heldForUpgrade} rules={rules}/></>}
        {networkView === "nonworking" && <NonWorkingTree address={address} team={team} currentLevel={nonWorking}/>}
        {networkView === "single" && <SingleLegTree address={address} directs={participant?.directCount} currentLevel={singleLeg} line={singleLegLine.data} lineLoading={singleLegLine.isLoading} lineError={singleLegLine.isError}/>}
        {networkView === "reentry" && <ReentryView address={address} slTeam={slTeam} line={singleLegLine.data} directs={directCount} singleLeg={singleLeg} entries={singleLegEntries} reentries={singleLegReentries}/>}
      </div>}

      {tab === "royalty" && <div className="db-stack">
        <div className="db-summary">
          <div className="primary"><span className="db-sum-icon"><Crown size={16}/></span><small>Royalty income waiting</small><b>{formatToken(pendingRoyalty)} <em>USDT</em></b><span>Your live, unsettled share of the {rankNames[currentRank]} club</span><button className="pill" disabled={!withdrawable || claimBusy} onClick={doClaim}>{claimBusy ? "Withdrawing…" : "Withdraw rewards"} {!claimBusy && <ArrowUpRight size={15}/>}</button></div>
          <div><span className="db-sum-icon"><TrendingUp size={16}/></span><small>Lifetime royalty income</small><b>{history.data ? formatToken(royaltyLifetime) : "—"} <em>USDT</em></b><span>{history.data ? `${royaltyPayments} credited ${royaltyPayments === 1 ? "payment" : "payments"}` : "History service unavailable"}</span></div>
          <div><span className="db-sum-icon"><Award size={16}/></span><small>Members sharing your club</small><b>{currentRank >= 1 ? clubMembers[currentRank - 1]?.toLocaleString() ?? "—" : "—"}</b><span>{currentRank >= 5 ? `Your weight: ${fiveStarWeight?.toString() ?? "—"} · +1 per extra 1,000 team members` : "Your club's 3% is split equally among these members"}</span></div>
        </div>
        {actionError && <p className="db-error">{actionError}</p>}

        {royaltyClaimable === false && <div className="db-alert"><span><Lock size={18}/></span><div><b>Your club income is held until you have {rules.clubClaimDirects[currentRank]} direct referrals</b><p>You're in the {rankNames[currentRank]} club and keep earning its royalty ({formatToken(pendingRoyalty)} USDT so far). It becomes claimable as soon as you have {rules.clubClaimDirects[currentRank]} directs — you have {directCount}.</p></div></div>}

        <div className="db-card">
          <div className="db-section-head"><div><small>ROYALTY CLUBS</small><h3>All six clubs</h3></div><span className="db-tag">You: {rankNames[currentRank]}{isWeeklyLeader ? " · Superstar" : ""}</span></div>
          <div className="club-grid">{royaltyClubs.filter(club => club.rank !== null).map(club => {
            const rank = club.rank as number;
            const state = rank === currentRank ? "current" : rank < currentRank ? "reached" : "locked";
            const fund = clubFunds.data?.find(item => item.rank === rank);
            // Per-member share credited to the club so far (accumulator / 1e24); 5 Star is per weight.
            const perMember = (rank === 5 ? accFiveStar : accClub[rank - 1]) ?? 0n;
            return <div key={club.name} className={`club-tier ${state}`}>
              <div className="club-tier-head"><span className="club-tier-icon">{rank === 5 ? <Crown size={15}/> : <Award size={15}/>}</span>{state === "current" ? <em>Your club</em> : state === "reached" ? <Check size={14}/> : null}</div>
              <b>{club.name}</b>
              <small>{rankRequirementText(rank, rules.ranks[rank])}</small>
              <ul><li><span>Income cap</span><strong>{rankCapText(rules.ranks[rank])}</strong></li><li><span>Royalty pool</span><strong>{pct(rules.royaltyBps / 5n)} royalty</strong></li><li><span>Claim with</span><strong>{rules.clubClaimDirects[rank] === 0 ? "No condition" : `${rules.clubClaimDirects[rank]} directs`}</strong></li><li><span>Members</span><strong>{clubMembers[rank - 1]?.toLocaleString() ?? "—"}</strong></li></ul>
              <div className="club-fund">
                <div><small>Total fund received</small><b>{fund ? formatToken(BigInt(fund.received)) : "—"} <em>USDT</em></b></div>
                <div><small>{rank === 5 ? "Per weight so far" : "Per member so far"}</small><b>{formatToken(perMember / 10n ** 24n)} <em>USDT</em></b></div>
                {fund && BigInt(fund.toVault) > 0n && <span>{formatToken(BigInt(fund.toVault))} USDT went to the vault while the club was empty</span>}
                {state === "current" && <div className="club-claim">
                  <small>Your share waiting</small><b>{formatToken(pendingRoyalty)} <em>USDT</em></b>
                  <span>{royaltyClaimable === false ? `Held until you have ${rules.clubClaimDirects[rank]} directs (you have ${directCount})` : "Claimable — paid with your next withdrawal"}</span>
                  <button className="pill" disabled={!withdrawable || claimBusy || royaltyClaimable === false} onClick={event => { event.stopPropagation(); doClaim(); }}>{claimBusy ? "Withdrawing…" : "Claim with withdrawal"}</button>
                </div>}
              </div>
            </div>;
          })}</div>
          <div className={`superstar-club${isWeeklyLeader ? " leading" : ""}`}>
            <div className="ss-glow"/>
            <div className="ss-sparkles"><i/><i/><i/><i/><i/><i/></div>
            <div className="ss-main">
              <span className="ss-trophy"><Trophy size={30}/></span>
              <div>
                <small>✦ THE 6TH CLUB · WEEKLY</small>
                <h4>Superstar Club</h4>
                <p>Be the week's top recruiter with {superstarMin}+ direct referrals and take the entire Superstar prize pool.</p>
              </div>
              {isWeeklyLeader && <em className="ss-badge"><Crown size={12}/> You're leading</em>}
            </div>
            <div className="ss-stats">
              <div className="ss-prize"><small>Prize pool</small><b>{formatToken(superstarReserve)} <em>USDT</em></b></div>
              <div><small>Your directs this week</small><b>{weeklyDirects?.toString() ?? "—"}</b></div>
              <div><small>Leading score</small><b>{weeklyCompetition?.[1]?.toString() ?? "—"}</b></div>
              <div><small>Week closes</small><b className="ss-small">{weekEnds}</b></div>
            </div>
            <div className="ss-progress"><div><span>{Number(weeklyDirects ?? 0n) >= superstarMin ? "Qualified — keep recruiting to stay on top" : `${superstarMin - Number(weeklyDirects ?? 0n)} more directs this week to qualify`}</span><b>{Math.min(Number(weeklyDirects ?? 0n), superstarMin)} / {superstarMin}</b></div><div className="ss-bar"><i style={{ width: `${Math.min(100, Number(weeklyDirects ?? 0n) / Math.max(1, superstarMin) * 100)}%` }}/></div></div>
          </div>
        </div>

        <div className="db-two">
          <div className="db-card db-club">
            <div className="db-section-head"><div><small>ROYALTY CLUB STATUS</small><h3>{currentRank >= 1 ? "Your club income is active" : "Join to earn club income"}</h3></div><span className="club-badge"><Crown size={14}/> {rankNames[currentRank]} club</span></div>
            <div className="club-amount"><small>Current rank</small><b>{rankNames[currentRank]}</b><span>Every 1–5 Star club gets 3% of all withdrawals, shared among that club's members. Rank up to move into a higher club.</span></div>
            {currentRank < 5 ? <div className="club-reqs">
              <div><div><span>Directs to claim 5 Star income</span><b>{Math.min(directCount, rules.clubClaimDirects[5])} / {rules.clubClaimDirects[5]}</b></div><div className="db-bar"><i style={{ width: `${Math.min(100, directCount / Math.max(1, rules.clubClaimDirects[5]) * 100)}%` }}/></div></div>
              <div><div><span>Level {topRule.qualifiedLevel} members</span><b>{Math.min(qualifiedAt(topRule.qualifiedLevel), topRule.qualifiedCount).toLocaleString()} / {topRule.qualifiedCount.toLocaleString()}</b></div><div className="db-bar"><i style={{ width: `${Math.min(100, qualifiedAt(topRule.qualifiedLevel) / Math.max(1, topRule.qualifiedCount) * 100)}%` }}/></div></div>
            </div> : <p className="db-foot-note">Your weight increases automatically whenever your qualified team reaches another 1,000-member milestone.</p>}
          </div>

          <div className="db-card db-fee">
            <div className="db-section-head"><div><small>HOW IT IS FUNDED</small><h3>Withdrawal-funded royalty</h3></div></div>
            <ul className="fee-rows">
              <li><span><i className="club"/>Every reward withdrawal</span><b>{pct(rules.royaltyBps)}</b></li>
              <li><span><i className="you"/>Each club (1–5 Star)</span><b>{pct(rules.royaltyBps / 5n)}</b></li>
              <li><span><i className="dev"/>Distribution</span><b>Equal within club</b></li>
            </ul>
            <div className="fee-total"><span>Claim behavior</span><b>Automatic</b></div>
            <p className="db-foot-note">Your pending club share is settled into your claimable balance when you withdraw. The same {pct(10_000n - rules.royaltyBps - rules.developmentBps)} user, {pct(rules.royaltyBps)} clubs and {pct(rules.developmentBps)} development split then applies.</p>
          </div>
        </div>

        <div className="db-card">
          <div className="db-section-head"><div><small>ROYALTY ACTIVITY</small><h3>Your latest club income</h3></div>{history.data && <span className="db-tag">{royaltyPayments} total</span>}</div>
          {history.isLoading && <div className="src-skeleton"><i/><i/></div>}
          {history.isError && <p className="db-warn">Royalty history is unavailable right now. Your pending amount above is read directly from the contract.</p>}
          {history.data && royaltyActivity.length === 0 && <p className="db-empty-note">No Royalty Club income has been credited yet.</p>}
          {royaltyActivity.length > 0 && <ul className="act-list">{royaltyActivity.slice(0, 10).map(item => <li key={`${item.txHash}-${item.amount}`}>
            <span className="act-icon"><Crown size={15}/></span>
            <div><b>Royalty Club income</b><small>Block {Number(item.blockNumber).toLocaleString()} · <span className="mono">{item.txHash.slice(0, 10)}…</span></small></div>
            <a href={`${explorerUrl}/tx/${item.txHash}`} target="_blank" rel="noreferrer">+{formatToken(BigInt(item.amount))} <em>USDT</em> <ExternalLink size={12}/></a>
          </li>)}</ul>}
        </div>
      </div>}

      {tab === "ledger" && <IncomeLedger address={address} lifetime={history.data ? BigInt(history.data.lifetimeCredited) : undefined} withdrawn={history.data?.withdrawnGross} withdrawals={history.data?.claims.count} balance={withdrawable} queued={queued} initialReason={ledgerReason}/>}
    </div></section>
  </motion.div>;
}

/** Every member of your team (10 sponsor levels), read from the contract, with filters and search. */
function MyTeam({ address }: { address: Address }) {
  const team = useOnchainTeam(address);
  const members = team.data ?? [];
  const reads = useReadContracts({
    allowFailure: true,
    contracts: protocolAddress ? members.flatMap(member => [
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "starRank" as const, args: [member.address] as const },
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "workingLevel" as const, args: [member.address] as const },
    ]) : [],
    query: { enabled: members.length > 0, refetchInterval: 30_000 },
  });
  const [level, setLevel] = useState(0);
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(20);
  const depths = [...new Set(members.map(member => member.depth))].sort((a, b) => a - b);
  const query = search.trim().toLowerCase().replace(/^#/, "");
  const rows = members
    .map((member, index) => ({ ...member, rank: Number(reads.data?.[index * 2]?.result ?? 0), working: Number(reads.data?.[index * 2 + 1]?.result ?? 0) }))
    .filter(member => level === 0 || member.depth === level)
    .filter(member => !query || member.address.toLowerCase().includes(query) || member.memberId === query)
    .sort((a, b) => a.depth - b.depth || Number(BigInt(a.memberId) - BigInt(b.memberId)));
  const directs = members.filter(member => member.depth === 1).length;

  return <div className="db-card my-team">
    <div className="db-section-head"><div><small>MY TEAM</small><h3>Everyone in your team</h3></div><span className="db-tag">{members.length.toLocaleString()} members · {directs} direct</span></div>
    <div className="my-team-tools">
      <div className="my-team-levels">
        <button className={level === 0 ? "active" : ""} onClick={() => { setLevel(0); setShown(20); }}>All</button>
        {depths.map(depth => <button key={depth} className={level === depth ? "active" : ""} onClick={() => { setLevel(depth); setShown(20); }}>L{depth} <em>{members.filter(member => member.depth === depth).length}</em></button>)}
      </div>
      <input value={search} onChange={event => { setSearch(event.target.value); setShown(20); }} placeholder="Search wallet or member #" aria-label="Search team"/>
    </div>
    {team.isLoading && <div className="src-skeleton"><i/><i/><i/></div>}
    {team.isError && <p className="db-warn">Couldn't read your team from the contract right now.</p>}
    {team.data && members.length === 0 && <p className="db-empty-note">No team members yet. Share your invite link to start building your team.</p>}
    {rows.length > 0 && <div className="ledger-table-wrap"><table className="ledger-table my-team-table">
      <thead><tr><th>Member</th><th>Level</th><th>Sponsor</th><th className="num">Directs</th><th>Rank</th><th>Working</th><th>Joined</th></tr></thead>
      <tbody>{rows.slice(0, shown).map(member => <tr key={member.address}>
        <td data-label="Member"><span className="my-team-member"><b>#{member.memberId}</b><a className="mono" href={`${explorerUrl}/address/${member.address}`} target="_blank" rel="noreferrer">{shortAddress(member.address)} <ExternalLink size={10}/></a></span></td>
        <td data-label="Level"><span className={`my-team-depth d${Math.min(member.depth, 4)}`}>{member.depth === 1 ? "Direct" : `Level ${member.depth}`}</span></td>
        <td data-label="Sponsor" className="mono">{member.sponsor.toLowerCase() === address.toLowerCase() ? "You" : shortAddress(member.sponsor)}</td>
        <td data-label="Directs" className="num">{member.directCount}</td>
        <td data-label="Rank">{rankNames[member.rank] ?? "—"}</td>
        <td data-label="Working">{member.working > 0 ? `Level ${member.working}` : "—"}</td>
        <td data-label="Joined">{new Date(member.joinedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</td>
      </tr>)}</tbody>
    </table></div>}
    {team.data && members.length > 0 && rows.length === 0 && <p className="db-empty-note">No members match this filter.</p>}
    {rows.length > shown && <div className="ledger-pages"><button className="db-btn" onClick={() => setShown(shown + 20)}>Show more ({(rows.length - shown).toLocaleString()} more)</button></div>}
  </div>;
}

/** Where a credit came from: the member who triggered it (linked) and a plain explanation. */
function SourceNote({ source }: { source: CreditSource | null }) {
  if (!source) return <span className="src-note">Credited to your balance</span>;
  return <span className="src-note">
    {source.member && <a className="mono" href={`${explorerUrl}/address/${source.member.address}`} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>#{source.member.memberId} · {shortAddress(source.member.address)}</a>}
    <span>{source.note}</span>
  </span>;
}

/** The latest payments of one income type, each with its source, shown under the Earnings breakdown. */
const POOL_OF_REASON: Record<string, number> = { SINGLE_LEG_INCOME: 1, WORKING_LEVEL_INCOME: 2, NON_WORKING_MATRIX_INCOME: 3 };

function StreamEntries({ address, reason, onViewAll }: { address: Address; reason: string; onViewAll: () => void }) {
  const ledger = useLedger(address, { kind: "credit", reason, page: 1 }, 10);
  const pool = POOL_OF_REASON[reason];
  const sources = usePoolSources(address, pool);
  return <div className="src-entries" onClick={event => event.stopPropagation()}>
    {pool && <div className="src-origin">
      <small>WHERE IT CAME FROM</small>
      {sources.isLoading && <p className="db-foot-note">Loading levels…</p>}
      {sources.isError && <p className="db-warn">Level details aren't available right now.</p>}
      {sources.data && sources.data.length === 0 && <p className="db-foot-note">No pool levels recorded yet.</p>}
      {sources.data && sources.data.length > 0 && <ul>{sources.data.map(item => <li key={`${item.txHash}-${item.member?.address ?? "own"}-${item.level}`}>
        <b className={item.own ? "own" : ""}>+{formatToken(BigInt(item.share))} <em>USDT</em></b>
        <span className="src-note">
          {item.member && <a className="mono" href={`${explorerUrl}/address/${item.member.address}`} target="_blank" rel="noreferrer">{item.member.memberId ? `#${item.member.memberId} · ` : ""}{shortAddress(item.member.address)}</a>}
          <span>{item.note}</span>
        </span>
        <a className="src-tx" href={`${explorerUrl}/tx/${item.txHash}`} target="_blank" rel="noreferrer"><ExternalLink size={11}/></a>
      </li>)}</ul>}
      <p className="db-foot-note">These are queued into your pool as levels are reached, then paid to your balance when you move team income (below).</p>
    </div>}
    {pool && <small className="src-sub">MOVED TO YOUR BALANCE</small>}
    {ledger.isLoading && <p className="db-foot-note">Loading payments…</p>}
    {ledger.isError && <p className="db-warn">Payment details aren't available right now.</p>}
    {ledger.data && ledger.data.entries.length === 0 && <p className="db-foot-note">These were credited before per-payment history was recorded.</p>}
    {ledger.data && ledger.data.entries.length > 0 && <ul>{ledger.data.entries.map(entry => <li key={`${entry.txHash}-${entry.logIndex}`}>
      <b>+{formatToken(BigInt(entry.amount))} <em>USDT</em></b>
      <SourceNote source={entry.source}/>
      <a className="src-tx" href={`${explorerUrl}/tx/${entry.txHash}`} target="_blank" rel="noreferrer"><ExternalLink size={11}/></a>
    </li>)}</ul>}
    {ledger.data && ledger.data.total > ledger.data.entries.length && <button className="db-text-btn" onClick={onViewAll}>View all {ledger.data.total} in Income Ledger <ChevronRight size={13}/></button>}
  </div>;
}

/** Every income credit and withdrawal, newest first. Totals come from the contract; entries from its events. */
function IncomeLedger({ address, lifetime, withdrawn, withdrawals, balance, queued, initialReason }: { address: Address; lifetime?: bigint; withdrawn?: bigint; withdrawals?: number; balance?: bigint; queued: bigint; initialReason?: string }) {
  const [filter, setFilter] = useState<LedgerFilter>(initialReason ? { kind: "credit", reason: initialReason, page: 1 } : { kind: "all", page: 1 });
  useEffect(() => { if (initialReason) setFilter({ kind: "credit", reason: initialReason, page: 1 }); }, [initialReason]);
  const ledger = useLedger(address, filter);
  const client = usePublicClient({ chainId: requiredChainId });
  const blocks = [...new Set(ledger.data?.entries.map(entry => entry.blockNumber) ?? [])];
  const times = useQuery({
    queryKey: ["block-times", blocks.join(",")],
    enabled: Boolean(client && blocks.length),
    staleTime: Infinity,
    queryFn: async () => Object.fromEntries(await Promise.all(blocks.map(async block => [block, Number((await client!.getBlock({ blockNumber: BigInt(block) })).timestamp)] as const))),
  });
  const pages = ledger.data ? Math.max(1, Math.ceil(ledger.data.total / ledger.data.pageSize)) : 1;
  const choose = (next: Omit<LedgerFilter, "page">) => setFilter({ ...next, page: 1 });
  const when = (block: string) => times.data?.[block] ? new Date(times.data[block] * 1000).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : `Block ${Number(block).toLocaleString()}`;

  return <div className="db-stack">
    <div className="db-summary ledger-summary">
      <div className="primary"><span className="db-sum-icon"><TrendingUp size={16}/></span><small>Lifetime earned</small><b>{formatToken(lifetime)} <em>USDT</em></b><span>Every income credited to you</span></div>
      <div><span className="db-sum-icon"><ArrowUpRight size={16}/></span><small>Withdrawn</small><b>{formatToken(withdrawn)} <em>USDT</em></b><span>{withdrawals ?? 0} {withdrawals === 1 ? "withdrawal" : "withdrawals"} (gross)</span></div>
      <div><span className="db-sum-icon"><Wallet size={16}/></span><small>Balance</small><b>{formatToken(balance)} <em>USDT</em></b><span>{queued > 0n ? `+ ${formatToken(queued)} USDT team income in pools` : "Ready to withdraw"}</span></div>
    </div>

    <div className="db-card ledger-card">
      <div className="db-section-head"><div><small>INCOME LEDGER</small><h3>Every credit and withdrawal</h3></div>{ledger.data && <span className="db-tag">{ledger.data.total.toLocaleString()} entries</span>}</div>
      <div className="ledger-filters">
        {([["all", "All"], ["credit", "Income"], ["withdrawal", "Withdrawals"]] as const).map(([kind, label]) => <button key={kind} className={filter.kind === kind && !filter.reason ? "active" : ""} onClick={() => choose({ kind })}>{label}</button>)}
        <select value={filter.reason ?? ""} onChange={event => choose(event.target.value ? { kind: "credit", reason: event.target.value } : { kind: "all" })} aria-label="Income type">
          <option value="">All income types</option>
          {incomeStreams.map(stream => <option key={stream.reason} value={stream.reason}>{stream.name}</option>)}
        </select>
      </div>

      {ledger.isError && <p className="db-warn">The ledger service isn't reachable right now. Your totals above are read directly from the contract.</p>}
      {ledger.isLoading && <div className="src-skeleton"><i/><i/><i/></div>}
      {ledger.data && ledger.data.entries.length === 0 && <p className="db-empty-note">No entries for this filter yet.</p>}
      {ledger.data && ledger.data.entries.length > 0 && <div className="ledger-table-wrap"><table className="ledger-table">
        <thead><tr><th>Date</th><th>Type</th><th className="num">Amount</th><th>Source</th><th>Transaction</th></tr></thead>
        <tbody>{ledger.data.entries.map(entry => {
          const credit = entry.kind === "credit";
          const Icon = credit ? streamIcon(entry.reason ?? "") : ArrowUpRight;
          return <tr key={`${entry.txHash}-${entry.logIndex}`} className={entry.kind}>
            <td data-label="Date">{when(entry.blockNumber)}</td>
            <td data-label="Type"><span className="ledger-type"><i><Icon size={13}/></i>{credit ? incomeName(entry.reason ?? "") : "Withdrawal"}</span></td>
            <td data-label="Amount" className="num"><b>{credit ? "+" : "−"}{formatToken(BigInt(entry.amount))}</b> <em>USDT</em></td>
            <td data-label="Source">{credit ? <SourceNote source={entry.source}/> : `You received ${formatToken(BigInt(entry.net ?? "0"))} · clubs ${formatToken(BigInt(entry.royalty ?? "0"))} · development ${formatToken(BigInt(entry.development ?? "0"))}`}</td>
            <td data-label="Transaction"><a className="mono" href={`${explorerUrl}/tx/${entry.txHash}`} target="_blank" rel="noreferrer">{entry.txHash.slice(0, 10)}… <ExternalLink size={11}/></a></td>
          </tr>;
        })}</tbody>
      </table></div>}

      {ledger.data && pages > 1 && <div className="ledger-pages">
        <button className="db-btn" disabled={filter.page <= 1} onClick={() => setFilter({ ...filter, page: filter.page - 1 })}><ChevronLeft size={14}/> Newer</button>
        <span>Page {filter.page} of {pages}</span>
        <button className="db-btn" disabled={filter.page >= pages} onClick={() => setFilter({ ...filter, page: filter.page + 1 })}>Older <ChevronRight size={14}/></button>
      </div>}
      <p className="db-foot-note">Entries come from the contract's RewardCredited and Claimed events. Withdrawals show the gross amount; the split shows what you received and what went to the star clubs and development.</p>
    </div>
  </div>;
}

function WorkingDistributionPanel({ directs, heldForUpgrade, rules }: { directs: number; heldForUpgrade?: bigint; rules: ProtocolRules }) {
  const need = rules.activationDirects;
  const upgradeDirect = rules.upgradeDirect;
  const active = directs >= need;
  const alloc = rules.workingAllocation;
  const share = (bps: bigint) => alloc * bps / 10_000n;
  const usdt = (value: bigint) => `${formatToken(value)} USDT`;
  const [u1, u2, u3, deep] = rules.uplineBps;
  const deepCount = rules.uplineBps.length - 3;
  const directIncome = share(rules.directShareBps);
  const allocLabel = formatToken(alloc);
  const rows = [
    ["Sponsor", pct(rules.directShareBps), usdt(directIncome), `Every direct except your ${upgradeDirect === 2 ? "2nd" : `#${upgradeDirect}`}`],
    ["Sponsor's U1", pct(u1), usdt(share(u1)), "Immediate eligible upline"],
    ["Sponsor's U2", pct(u2), usdt(share(u2)), "Second eligible upline"],
    ["Sponsor's U3", pct(u3), usdt(share(u3)), "Third eligible upline"],
    [`Sponsor's U4–U${deepCount + 3}`, `${pct(deep)} each`, `${usdt(share(deep))} each`, `${deepCount} eligible upline levels`],
  ] as const;
  return <div className="progression-view">
    <div className="view-heading"><div><small>{allocLabel} USDT WORKING MATRIX</small><h4>Direct and nine-level distribution</h4></div><p>Working Level 1: your 1st direct pays you the {pct(rules.directShareBps)} sponsor share ({usdt(directIncome)}); your {upgradeDirect === 2 ? "2nd" : `#${upgradeDirect}`} direct's whole {allocLabel} USDT is your auto-upgrade into Level 2; every direct after that pays you {usdt(directIncome)} again. Upline income starts at {need} directs.</p></div>
    <div className="db-summary">
      <div className="primary"><span className="db-sum-icon"><Users size={16}/></span><small>Activation progress</small><b>{Math.min(directs, need)} / {need}</b><span>{active ? "Working Matrix income is active" : `${need - directs} more direct ${need - directs === 1 ? "referral" : "referrals"} required`}</span></div>
      <div><span className="db-sum-icon"><Coins size={16}/></span><small>Direct income</small><b>{formatToken(directIncome)} <em>USDT</em></b><span>{pct(rules.directShareBps)} from every direct after activation</span></div>
      <div><span className="db-sum-icon"><Lock size={16}/></span><small>{upgradeDirect === 2 ? "2nd" : `#${upgradeDirect}`} direct · auto-upgrade</small><b>{formatToken(heldForUpgrade)} <em>USDT</em></b><span>{allocLabel} USDT of your {upgradeDirect === 2 ? "2nd" : `#${upgradeDirect}`} direct funds your Level 2 upgrade</span></div>
    </div>
    <div className="pool-economics">
      <div className="pool-economics-head"><div><small>PER REGISTRATION</small><h4>Exact {allocLabel} USDT distribution</h4></div><div className="pool-selected-summary"><span>Upline eligibility</span><b>{need} direct referrals</b></div></div>
      <div className="pool-table-wrap"><table className="pool-table"><thead><tr><th>Recipient</th><th>Share</th><th>Amount</th><th>Rule</th></tr></thead><tbody>{rows.map(([recipient, share, amount, rule]) => <tr key={recipient}><td data-label="Recipient">{recipient}</td><td data-label="Share">{share}</td><td data-label="Amount">{amount}</td><td data-label="Rule">{rule}</td></tr>)}</tbody></table></div>
    </div>
  </div>;
}

type WorkingQuote = readonly [bigint, bigint, bigint, bigint, bigint];
type SingleLegQuote = readonly [bigint, bigint, bigint, bigint, bigint, bigint];

function useLevelQuotes(kind: "working" | "nonworking") {
  const count = 15;
  const functionName = kind === "working" ? "workingLevelQuote" as const : "nonWorkingLevelQuote" as const;
  const quotes = useReadContracts({
    allowFailure: true,
    contracts: protocolAddress ? Array.from({ length: count }, (_, index) => ({ address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName, args: [index + 1] as const })) : [],
    query: { enabled: configured, refetchInterval: 60_000, retry: 2 },
  });
  return Array.from({ length: count }, (_, index) => quotes.data?.[index]?.result as WorkingQuote | undefined);
}

/** Working tab: the position architecture and contract-read economics. */
function WorkingMatrixView({ address, team, workingLevel }: { address?: Address; team?: bigint; workingLevel?: number }) {
  const working = useLevelQuotes("working");
  return <PoolMatrixPanel kind="working" address={address} team={team} currentLevel={workingLevel} maxLevel={15} quotes={working}/>;
}

/** Non-Working: positions fill only with team members who entered by reaching Single-Leg Level 1. */
/** Non-Working: every member enters on joining, so positions fill with your whole 10-level team. */
function NonWorkingTree({ address, team, currentLevel }: { address?: Address; team?: bigint; currentLevel?: number }) {
  const values = useLevelQuotes("nonworking");
  return <PoolMatrixPanel kind="nonworking" address={address} team={team} currentLevel={currentLevel} maxLevel={15} quotes={values}/>;
}

/** Contract `_queueTableDistribution`: 80% to the achiever, 10% to U1 and 10% across U2–U9. */
const tableIncome = (distributable?: bigint) => distributable === undefined ? undefined : distributable * 8_000n / 10_000n;
const tableUpline = (distributable?: bigint) => distributable === undefined ? undefined : distributable - distributable * 8_000n / 10_000n;
const dollars = (value?: bigint) => value === undefined ? "—" : `$${formatToken(value)}`;

function PoolMatrixPanel({ kind, address, team, currentLevel: contractLevel = 0, maxLevel, quotes }: {
  kind: "working" | "nonworking"; address?: Address; team?: bigint; currentLevel?: number; maxLevel: number; quotes: (WorkingQuote | undefined)[];
}) {
  void team;
  // Self-funding matrices: levels come from the contract; a level fills with entries placed in your matrix.
  const currentLevel = contractLevel;
  const initialLevel = Math.min(maxLevel, Math.max(1, currentLevel + 1));
  const [selectedLevel, setSelectedLevel] = useState(initialLevel);
  useEffect(() => { setSelectedLevel(Math.min(maxLevel, Math.max(1, currentLevel + 1))); }, [currentLevel, maxLevel]);
  const teamQuery = useOnchainTeam(address, 1);
  const directs = [...(teamQuery.data ?? [])].sort((a, b) => Number(BigInt(a.memberId) - BigInt(b.memberId)));
  // Entries placed in your matrix at the level you are filling (key: level, or level + 16 for Non-Working).
  const fillReads = useReadContracts({
    allowFailure: true,
    contracts: protocolAddress && address ? Array.from({ length: maxLevel }, (_, index) => ({
      address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "matrixFilled" as const,
      args: [address, kind === "working" ? index + 1 : index + 17] as const,
    })) : [],
    query: { enabled: Boolean(protocolAddress && address), refetchInterval: 15_000 },
  });
  const quote = quotes[selectedLevel - 1];
  const required = Number(quote?.[0] ?? BigInt(selectedLevel * 2));
  /** Filled positions: all of a completed level, the live count for the level you are filling, none above. */
  const filledAt = (level: number) => {
    const size = level * 2;
    if (currentLevel >= level) return size;
    if (level !== currentLevel + 1) return 0;
    if (kind === "working" && level === 1) return Math.min(directs.length, size);
    return Number(fillReads.data?.[level - 1]?.result ?? 0);
  };
  // Working Level 1 holds all your directs (every direct after the 2nd pays you again); other levels are fixed.
  const workingLevelOne = kind === "working" && selectedLevel === 1;
  const holders = workingLevelOne ? directs : [];
  const filledCount = workingLevelOne ? directs.length : filledAt(selectedLevel);
  const nodeCount = workingLevelOne ? Math.max(required, filledCount) : required;
  const positions = Array.from({ length: nodeCount }, (_, index) => index + 1);
  const filledInLevel = Math.min(filledCount, required);
  const unlimited = workingLevelOne;
  const levelActive = (level: number) => level <= currentLevel + 1;
  const completes = true;
  const upgradedInto = Math.min(maxLevel, currentLevel + 1);
  const levelState = (level: number) => currentLevel >= level ? "reached"
    : level === upgradedInto ? "unlocked"
    : "locked";
  const stateLabel = { reached: "Complete", current: "In progress", unlocked: "Unlocked", locked: "Locked" } as const;
  const reached = currentLevel >= selectedLevel;
  const current = levelActive(selectedLevel);
  const name = kind === "working" ? "Working" : "Non-Working";
  const title = `${name} Matrix`;

  return <div className={`pool-matrix-view ${kind}`}>
    <div className="pool-matrix-focus">
      <div className="pool-arch-head"><small>{name.toUpperCase()} MATRIX</small><h4>Position Architecture</h4></div>
      <div className="pool-level-picker" role="tablist" aria-label={`${name} levels`}>
        {Array.from({ length: maxLevel }, (_, index) => {
          const level = index + 1;
          const state = levelState(level);
          return <button key={level} role="tab" aria-selected={selectedLevel === level} className={`${state}${selectedLevel === level ? " active" : ""}`} onClick={() => setSelectedLevel(level)} title={stateLabel[state]}>
            {state === "locked" ? <Lock size={10}/> : state === "reached" ? <Check size={11}/> : state === "unlocked" ? <LockOpen size={10}/> : null}L{level}
          </button>;
        })}
      </div>
      <div className="pool-position-card">
        <span className="pool-avatar">M</span>
        <div><small>YOUR MATRIX POSITION</small><b>{address ? shortAddress(address) : "Secure wallet access"}</b></div>
        <div className="pool-level-stepper">
          <button aria-label="Previous level" disabled={selectedLevel <= 1} onClick={() => setSelectedLevel(level => Math.max(1, level - 1))}><ChevronLeft size={15}/></button>
          <strong>Level {selectedLevel}</strong>
          <button aria-label="Next level" disabled={selectedLevel >= maxLevel} onClick={() => setSelectedLevel(level => Math.min(maxLevel, level + 1))}><ChevronRight size={15}/></button>
        </div>
      </div>
      <div className="pool-connector"/>
      <div className="pool-completion"><span>Completion positions</span><b>{filledInLevel}/{required} toward automatic advancement</b></div>
      <div className={`pool-tree${nodeCount > 8 ? " dense" : ""}`} style={{ "--cols": Math.min(nodeCount, 8) } as CSSProperties}>
        {positions.map(position => {
          const filled = position <= filledCount;
          const holder = holders[position - 1];
          return <div className={`pool-node ${filled ? "filled" : "available"}${position > required ? " extra" : ""}`} key={position} title={holder ? holder.address : `Team position ${position}`}>
            <i>{filled ? <Check size={14}/> : position}</i>
            <b>{filled ? "FILLED" : "OPEN"}</b>
            <small>{holder ? <span className="mono">{shortAddress(holder.address)}</span> : `Position ${position}`}</small>
            {holder && <em>Direct</em>}
          </div>;
        })}
      </div>
      {!address
        ? <p className="pool-wallet-note">Connect your wallet to view this {name.toLowerCase()} team.</p>
        : fillReads.isError && <p className="pool-wallet-note">Couldn't read your matrix from the contract right now.</p>}
      <div className="pool-level-copy">
        <b>{unlimited ? `${filledCount} direct ${filledCount === 1 ? "member" : "members"} · Level 1 completes with your 2nd direct` : `${filledInLevel} of ${required} positions filled`}</b>
        <span>{reached ? "Complete · level paid and upgraded" : selectedLevel === upgradedInto ? `Unlocked · filling its ${required} positions with entries from your team` : `Locked · complete Level ${selectedLevel - 1} first`}</span>
      </div>
      <div className="pool-focus-progress"><i style={{ width: `${filledInLevel / required * 100}%` }}/></div>
      <p>{unlimited
        ? <>Level 1 holds your direct referrals. Your 1st direct pays you; your 2nd direct's ID amount is your auto-upgrade into Level 2; every direct after that pays you again.</>
        : <>Each position is one entry that paid this level's ID amount: a team member upgrading into Level {selectedLevel} fills the matrix of their nearest upline on this level. When all {required} are filled, the level pays out and your auto-upgrade enters you into the next level.</>}</p>
    </div>

    <div className="pool-economics">
      <div className="pool-economics-head">
        <div><small>CONTRACT-VERIFIED ECONOMICS</small><h4>{title}</h4></div>
        <div className="pool-selected-summary"><span>Selected Level {selectedLevel}</span><b>{required} team required</b></div>
      </div>
      <div className="pool-table-wrap"><table className="pool-table"><thead><tr><th>Level</th><th>Team</th><th className="num">ID amount</th><th className="num">Turnover</th><th className="num">Auto upgrade</th><th className="num">Income</th><th className="num">Upline</th><th>Status</th></tr></thead><tbody>
        {Array.from({ length: maxLevel }, (_, index) => {
          const level = index + 1;
          const row = quotes[index];
          const rowState = levelState(level);
          return <tr key={level} className={`${selectedLevel === level ? "selected" : ""} ${rowState}`} onClick={() => setSelectedLevel(level)} tabIndex={0} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelectedLevel(level); }}>
            <td data-label="Level"><span className="pool-td-level">Level </span>{level}</td>
            <td data-label="Team">{Number(row?.[0] ?? BigInt(level * 2))}</td>
            <td data-label="ID amount" className="num">{dollars(row?.[1])}</td>
            <td data-label="Turnover" className="num">{dollars(row?.[2])}</td>
            <td data-label="Auto upgrade" className="num">{dollars(row?.[3])}</td>
            <td data-label="Income" className="num income">{dollars(tableIncome(row?.[4]))}</td>
            <td data-label="Upline" className="num">{dollars(tableUpline(row?.[4]))}</td>
            <td data-label="Status"><span className="pool-status">{stateLabel[rowState]}</span></td>
          </tr>;
        })}
      </tbody></table></div>
      <p className="tree-disclaimer">Every value is read from the deployed contract. Income is the achiever's 80% of the amount left after auto-upgrade; Upline is the remaining 20% (10% to U1 and 10% shared across U2–U9).</p>
    </div>
  </div>;
}

/** Single-Leg re-entry: the one-time $9 re-entry at Single-Leg Level 3, for you and for each member of your team. */
function ReentryView({ address, slTeam, line, directs, singleLeg, entries, reentries }: {
  address?: Address; slTeam?: number; line?: { reentry: number; reentryLevel: number; reentryTeam: number; metAt: boolean[] }; directs: number; singleLeg?: number; entries?: bigint; reentries?: bigint;
}) {
  void slTeam;
  const teamQuery = useOnchainTeam(address);
  const members = teamQuery.data ?? [];
  const reads = useReadContracts({
    allowFailure: true,
    contracts: protocolAddress ? [
      { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "singleLegQuote" as const, args: [3] as const },
      ...members.flatMap(member => [
        { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "singleLegReentries" as const, args: [member.address] as const },
        { address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "singleLegLevel" as const, args: [member.address] as const },
      ]),
    ] : [],
    query: { enabled: configured, refetchInterval: 30_000 },
  });
  const quote = reads.data?.[0]?.result as SingleLegQuote | undefined;
  const needTeam = Number(quote?.[0] ?? 30n);
  const needDirects = Number(quote?.[1] ?? 1n);
  const amount = quote?.[3] ?? 9_000_000n;
  // Level 3 counts people after you who reached Level 2 (met once the Level 3 cursor passes you).
  const teamValue = line?.metAt[3] ? needTeam : 0;
  const mine = Number(reentries ?? 0n);
  const reentered = members
    .map((member, index) => ({ ...member, reentries: Number((reads.data?.[1 + index * 2]?.result as bigint | undefined) ?? 0n), level: Number(reads.data?.[2 + index * 2]?.result ?? 0) }))
    .filter(member => member.reentries > 0);
  const teamProgress = Math.min(100, teamValue / needTeam * 100);

  return <div className="progression-view reentry-view">
    <div className="view-heading"><div><small>SINGLE-LEG RE-ENTRY</small><h4>One-time {formatToken(amount)} USDT re-entry</h4></div><p>When a member reaches Single-Leg Level 3 ({needTeam} people after them in the line who reached Level 2, plus {needDirects} directs), they get a new position at the end of the line that climbs the levels and pays again. The contract records a one-time re-entry funded with {formatToken(amount)} USDT from the Single-Leg pool.</p></div>
    <div className="db-summary">
      <div className="primary"><span className="db-sum-icon"><Zap size={16}/></span><small>Your re-entries</small><b>{reentries === undefined ? "—" : mine}</b><span>{mine > 0 ? "Re-entry completed at Single-Leg Level 3" : `Unlocks at Single-Leg Level 3 · you are at Level ${singleLeg ?? 0}`}</span></div>
      <div><span className="db-sum-icon"><Layers size={16}/></span><small>Your re-entry position</small><b>{line?.reentry ? `#${line.reentry}` : "—"}</b><span>{line?.reentry ? `Level ${line.reentryLevel} / 10 · ${line.reentryTeam.toLocaleString()} joined after it` : `${entries?.toString() ?? "1"} entry so far`}</span></div>
      <div><span className="db-sum-icon"><Users size={16}/></span><small>Team members re-entered</small><b>{teamQuery.isLoading ? "—" : reentered.length.toLocaleString()}</b><span>Across your 10-level team</span></div>
    </div>

    {mine === 0 && <div className="db-card reentry-progress">
      <div className="db-section-head"><div><small>YOUR PROGRESS</small><h3>Road to your re-entry</h3></div><span className="db-tag">Level {singleLeg ?? 0} / 3</span></div>
      <div className="club-reqs">
        <div><div><span>After you at Level 2+</span><b>{Math.min(teamValue, needTeam).toLocaleString()} / {needTeam}</b></div><div className="db-bar"><i style={{ width: `${teamProgress}%` }}/></div></div>
        <div><div><span>Direct referrals</span><b>{Math.min(directs, needDirects)} / {needDirects}</b></div><div className="db-bar"><i style={{ width: `${Math.min(100, directs / Math.max(1, needDirects) * 100)}%` }}/></div></div>
      </div>
      <p className="db-foot-note">{teamValue >= needTeam && directs >= needDirects ? "Requirements met — your re-entry is recorded with the next team registration." : `${needTeam} people after you need to reach Single-Leg Level 2.`}</p>
    </div>}

    <div className="db-card">
      <div className="db-section-head"><div><small>TEAM RE-ENTRIES</small><h3>Members who have re-entered</h3></div><span className="db-tag">{reentered.length} {reentered.length === 1 ? "member" : "members"}</span></div>
      {!address && <p className="db-empty-note">Connect your wallet to view your team's re-entries.</p>}
      {teamQuery.isError && <p className="db-warn">Couldn't read your team from the contract right now.</p>}
      {address && !teamQuery.isLoading && reentered.length === 0 && <p className="db-empty-note">No one in your team has re-entered yet. Members re-enter when they reach Single-Leg Level 3.</p>}
      {reentered.length > 0 && <ul className="sl-team-list">{reentered.slice(0, 50).map(member => <li key={member.address}>
        <span className="act-icon"><Zap size={15}/></span>
        <div><b className="mono">{shortAddress(member.address)}</b><small>Member #{member.memberId} · {member.depth === 1 ? "Direct" : `Level ${member.depth} in your team`} · Single-Leg Level {member.level}</small></div>
        <strong>{member.reentries} re-entr{member.reentries === 1 ? "y" : "ies"}</strong>
      </li>)}</ul>}
      {reentered.length > 50 && <p className="db-foot-note">Showing the first 50 of {reentered.length.toLocaleString()} members.</p>}
    </div>
  </div>;
}

/** Published Single-Leg table, used until the contract's `singleLegQuote` reads arrive. Whole USDT. */
const SINGLE_LEG_TABLE = [
  [10, 1, 6, 0, 1], [15, 2, 15, 0, 2], [30, 3, 35, 9, 3], [60, 5, 50, 0, 5], [250, 8, 150, 0, 10],
  [600, 11, 500, 0, 30], [1_000, 14, 1_500, 0, 100], [1_500, 17, 3_500, 0, 400], [2_500, 21, 10_000, 0, 1_000], [3_700, 25, 15_000, 0, 2_500],
] as const;
const usdt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

type SingleLegLineData = NonNullable<ReturnType<typeof useSingleLegLine>["data"]>;
function SingleLegTree({ address, directs, currentLevel, line, lineLoading, lineError }: { address?: Address; directs?: bigint; currentLevel?: number; line?: SingleLegLineData; lineLoading: boolean; lineError: boolean }) {
  const quotes = useReadContracts({
    allowFailure: true,
    contracts: protocolAddress ? Array.from({ length: 10 }, (_, index) => ({ address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "singleLegQuote" as const, args: [index + 1] as const })) : [],
    query: { enabled: configured, refetchInterval: 60_000, retry: 2 },
  });
  const toUsdt = (v: bigint) => Number(v) / 1e6;
  const levels = SINGLE_LEG_TABLE.map(([members, directNeed, income, extra, upline], index) => {
    const quote = quotes.data?.[index]?.result as SingleLegQuote | undefined;
    return quote
      ? { level: index + 1, members: Number(quote[0]), directs: Number(quote[1]), income: toUsdt(quote[2]), extra: toUsdt(quote[3]), upline: toUsdt(quote[4]) }
      : { level: index + 1, members, directs: directNeed, income, extra, upline };
  });
  const teamValue = line?.team ?? 0;
  const directValue = Number(directs ?? 0n);
  const done = currentLevel ?? 0;
  const next = levels[done];
  // Level 1 counts everyone after you; Level L counts people after you who reached Level L-1.
  const nextMet = next ? (next.level === 1 ? teamValue >= next.members : Boolean(line?.metAt[next.level])) : true;
  const countedTeam = !next ? 0 : next.level === 1 ? teamValue : nextMet ? next.members : 0;
  const teamLabel = !next || next.level === 1 ? "Joined after you" : `After you at Level ${next.level - 1}+`;
  const netReward = (level: typeof levels[number]) => level.income;
  const allocationNote = (level: typeof levels[number]) => level.extra === 0 ? undefined : level.level === 1 ? `${usdt(level.extra)} USDT → Global pool` : `${usdt(level.extra)} USDT → 1-time re-entry`;
  const earned = levels.slice(0, done).reduce((sum, level) => sum + netReward(level), 0);
  const remaining = levels.slice(done).reduce((sum, level) => sum + netReward(level), 0);
  const teamLeft = next ? Math.max(0, next.members - countedTeam) : 0;
  const directsLeft = next ? Math.max(0, next.directs - directValue) : 0;
  const todo = [
    teamLeft > 0 && (next?.level === 1
      ? `wait for ${teamLeft.toLocaleString()} more ${teamLeft === 1 ? "person" : "people"} to join the platform after you`
      : `have ${next?.members.toLocaleString()} people after you reach Single-Leg Level ${(next?.level ?? 2) - 1}`),
    directsLeft > 0 && `personally invite ${directsLeft} more ${directsLeft === 1 ? "person" : "people"}`,
  ].filter(Boolean) as string[];
  const bar = (have: number, need: number) => <div className="sl-bar"><i style={{ width: `${need ? Math.min(100, have / need * 100) : 100}%` }}/></div>;

  return <div className="progression-view sl">
    <div className="sl-explain">
      <div><span>1</span><b>The line grows</b><p>Level 1 counts everyone who joins after you. Each higher level counts people after you who reached the level below.</p></div>
      <div><span>2</span><b>Invite people yourself</b><p>Each level also needs a few members you referred directly.</p></div>
      <div><span>3</span><b>Unlock a one-time reward</b><p>When both targets are met, the level's reward is added to your team income automatically.</p></div>
    </div>

    {next ? <div className="sl-next">
      <div className="sl-next-head">
        <div><small>YOUR NEXT GOAL</small><h4>Level {next.level} <em>of 10</em></h4></div>
        <div className="sl-reward"><small>NET REWARD</small><b>{usdt(netReward(next))} <em>USDT</em></b></div>
      </div>
      <div className="sl-req">
        <div className={teamLeft === 0 ? "ok" : ""}><div><span><Users size={15}/> {teamLabel}</span><b>{Math.min(countedTeam, next.members).toLocaleString()} / {next.members.toLocaleString()}</b></div>{bar(countedTeam, next.members)}<small>{teamLeft === 0 ? <><Check size={12}/> Target met</> : `${teamLeft.toLocaleString()} more needed`}</small></div>
        <div className={directsLeft === 0 ? "ok" : ""}><div><span><UserRoundCheck size={15}/> Direct referrals</span><b>{Math.min(directValue, next.directs)} / {next.directs}</b></div>{bar(directValue, next.directs)}<small>{directsLeft === 0 ? <><Check size={12}/> Target met</> : `${directsLeft} more needed`}</small></div>
      </div>
      <p className="sl-todo"><Zap size={15}/><span>{address ? <>To unlock <b>{usdt(netReward(next))} USDT</b>, {todo.join(" and ")}.{allocationNote(next) ? ` ${allocationNote(next)}.` : ""}</> : "Connect your wallet to see your progress."}</span></p>
    </div> : <div className="sl-next sl-complete"><Award size={22}/><div><h4>All 10 levels complete</h4><p>You have unlocked every Single-Leg reward.</p></div></div>}

    <div className="sl-summary">
      <div><small>LEVELS DONE</small><b>{done} / 10</b></div>
      <div><small>YOUR SINGLE-LEG TEAM</small><b>{teamValue.toLocaleString()} <em>members</em></b></div>
      <div><small>UNLOCKED SO FAR</small><b>{usdt(earned)} <em>USDT</em></b></div>
      <div><small>STILL AVAILABLE</small><b>{usdt(remaining)} <em>USDT</em></b></div>
    </div>

    <div className="sl-team">
      <div className="sl-team-head">
        <div><small>GLOBAL LINE · FIRST COME, FIRST SERVED</small><h4>Joined after you</h4></div>
        <span>Your position #{line?.primary ?? "—"} · {teamValue.toLocaleString()} after you</span>
      </div>
      {lineLoading && <p className="db-foot-note">Loading the Single-Leg line…</p>}
      {lineError && <p className="db-warn">Couldn't read the Single-Leg line from the contract right now.</p>}
      {line && line.after.length === 0 && <p className="db-empty-note">Nobody has joined after you yet. Everyone who joins the platform after you counts, whoever referred them.</p>}
      {line && line.after.length > 0 && <ul className="sl-team-list">{line.after.map(entry => <li key={entry.position}>
        <span className="sl-team-depth">#{entry.position}</span>
        <span><b>Member #{entry.memberId}</b><small>{entry.reentry ? "Re-entry position" : "Joined the platform"}</small></span>
        <a className="mono" href={`${explorerUrl}/address/${entry.address}`} target="_blank" rel="noreferrer">{shortAddress(entry.address)} <ExternalLink size={11}/></a>
      </li>)}</ul>}
      {line && teamValue > line.after.length && <p className="db-foot-note">Showing the first {line.after.length} of {teamValue.toLocaleString()} positions after you.</p>}
    </div>

    <div className="sl-table" role="table" aria-label="Single-Leg levels">
      <div className="sl-row sl-th" role="row"><span>Level</span><span>Team needed</span><span>Direct referrals</span><span>Your reward</span><span>Status</span></div>
      {levels.map(l => {
        const state = l.level <= done ? "done" : l.level === done + 1 ? "next" : "locked";
        // Level 1 counts everyone after you; Level L counts people after you who reached Level L-1.
        const met = l.level === 1 ? teamValue >= l.members : Boolean(line?.metAt[l.level]);
        return <div className={`sl-row ${state}`} role="row" key={l.level}>
          <span className="sl-lvl"><i>{state === "done" ? <Check size={13}/> : l.level}</i><em>Level {l.level}</em></span>
          <span data-label="Team">{l.members.toLocaleString()}{l.level > 1 && <small> at Level {l.level - 1}+</small>}</span>
          <span data-label="Directs">{l.directs}</span>
          <span data-label="Reward" className="sl-amt"><span>{usdt(netReward(l))} USDT{allocationNote(l) && <small>{allocationNote(l)}</small>}</span></span>
          <span className="sl-status">{state === "done" ? "Complete" : state === "next" ? l.level === 1 ? `In progress · ${Math.min(teamValue, l.members).toLocaleString()} / ${l.members}` : met ? "Members met · needs directs" : "In progress" : "Locked"}</span>
        </div>;
      })}
    </div>

    <div className="sl-bonus"><Users size={16}/><p><b>Bonus for your sponsors.</b> Each time someone you invited (or someone they invited) unlocks a level, you also receive an upline bonus — from {usdt(levels[0].upline)} USDT at level 1 up to {usdt(levels[9].upline)} USDT at level 10. You need at least 2 direct referrals to receive it.</p></div>
    <p className="tree-disclaimer">Single-Leg rewards are queued as team income. Use “Move to balance” on the Earnings tab to add them to your claimable balance; the amount you can move is limited by your rank cap and the pool reserve.</p>
  </div>;
}

function Mechanics() { return <motion.div {...fade}>
    <section className="page-hero"><div className="wrap center"><p className="eyebrow">Mechanics</p><h1>Facts.<br/><span className="grad">Kept apart from claims.</span></h1><p className="sub">Only rules that reconcile with the source document are executable. Everything else waits for written clarification.</p></div></section>
    <section className="band gray">
      <div className="wrap-wide bento three">{[
        ["A single $30 ticket.", "The source document defines one USDT ticket, settled on BNB Smart Chain."],
        ["Allocation to the dollar.", "$15 to the Working Matrix, $9 to Single-Leg, and $1 to the Weekly Superstar fund. Enforced on every ticket."],
        ["Sponsorship, written once.", "A wallet registers once, against an existing sponsor. The record never changes."],
        ["No one holds the keys.", "The implemented core has no owner, no upgrade path, no pause switch and no rescue authority."],
        ["A reward engine for testnet.", "Matrix income, uplines, levels, ranks, re-entry, weekly rewards and claims run on documented prototype assumptions."],
        ["Verification for anyone.", "Events, balances, recipients and accounting totals stay queryable by anyone, at any time."],
      ].map(([t, b], i) => <div className="tile" key={t}><small className="label">{String(i + 1).padStart(2, "0")}</small><h3>{t}</h3><p>{b}</p></div>)}</div>
      <div className="wrap-wide"><div className="tile tile-dark notice-tile"><h3>For testnet validation only.</h3><p>This build guarantees no returns and is not ready for mainnet. Unresolved financial rules need written clarification, followed by independent security and legal review.</p></div></div>
    </section>
  </motion.div>;
}
