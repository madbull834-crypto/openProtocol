import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowRight, ArrowUpRight, Award, Calendar, Check, ChevronRight, Clock, Coins, Copy, Crown, ExternalLink, Eye, Fuel, Layers, LayoutGrid, Lock, MessageCircle, Network, Send, Share2, ShieldCheck, TrendingUp, UserRoundCheck, Users, Wallet, WalletCards, Zap } from "lucide-react";
import { decodeFunctionResult, encodeFunctionData, isAddress, zeroAddress, type Address } from "viem";
import { useAccount, useBalance, useReadContract, useReadContracts, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { chainId as requiredChainId, deploymentError, explorerUrl, genesisSponsor, protocolAddress, testTokenAddress, walletConnectEnabled } from "./config";
import { erc20Abi, mockUsdtAbi, protocolAbi } from "./contracts/abi";
import { useUi } from "./store/ui";
import { formatToken, shortAddress } from "./utils/format";
import { useMatrixTree, type MatrixNode } from "./matrix";
import { incomeName, incomeStreams, useDirectReferrals, useIncomeHistory } from "./income";
import { Landing } from "./Landing";
import { ReferralJoinPrompt, ReferralShare } from "./ReferralShare";

const allocation = [
  { name: "Working Matrix", value: 15, tone: "blue", note: "Funds 80% direct income and the nine Working Matrix upline levels." },
  { name: "Single-Leg", value: 9, tone: "green", note: "Funds Single-Leg rewards, the Level 2 redirect and Level 3 re-entry." },
  { name: "Weekly Superstar", value: 1, tone: "purple", note: "Added to the weekly fund for a recruiter who reaches at least five directs." },
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
  ["What does it cost to join?", "One fixed registration of 25 USDT, paid once. On this testnet build you use free test USDT that has no monetary value."],
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
  const price = ticket === undefined ? "25" : formatToken(ticket);
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
          ? "Your wallet needs at least 25 USDT before it can register."
          : /allowance|approval/i.test(register.error.message)
            ? "The USDT approval is missing or expired. Approve 25 USDT again."
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

const isMember = (participant?: { id: bigint }) => Boolean(participant?.id);

/** Mirrors `claim()`: 17% to the Royalty Club and 3% to development are taken from the gross amount. */
function claimFees(gross?: bigint) {
  const value = gross ?? 0n;
  const royalty = value * 1_700n / 10_000n;
  const development = value * 300n / 10_000n;
  return { royalty, development, net: value - royalty - development };
}

const streamIcons: Record<string, typeof Users> = {
  DIRECT_INCOME: Users, TEN_LEVEL_UPLINE: Layers, MATRIX_INCOME: LayoutGrid, NONWORKING_U1: UserRoundCheck, NONWORKING_UPLINE: Network,
  REENTRY: Zap, WEEKLY_SUPERSTAR: Award, SINGLE_LEG_INCOME: TrendingUp, WORKING_LEVEL_INCOME: Layers,
  NON_WORKING_MATRIX_INCOME: Network, FIVE_STAR_ROYALTY: ShieldCheck,
};
const streamIcon = (reason: string) => streamIcons[reason] ?? Coins;

const MAX_UINT = 2n ** 256n - 1n;
type PoolStatus = "empty" | "ready" | "cap" | "reserve";

/**
 * Mirrors `settlePoolRewards()`: each pool is paid in full or not at all, in the order
 * Single-Leg → Working → Non-Working, limited by the remaining rank cap and the pool reserve.
 */
function previewSettlement(input: { single?: bigint; working?: bigint; nonWorking?: bigint; cap?: bigint; settled?: bigint; workingReserve?: bigint; nonWorkingReserve?: bigint }) {
  const cap = input.cap ?? 0n;
  const settled = input.settled ?? 0n;
  const unlimited = cap === MAX_UINT;
  let capacity = unlimited ? MAX_UINT : cap > settled ? cap - settled : 0n;
  let workingReserve = input.workingReserve ?? 0n;
  const pools = ([["single", input.single], ["working", input.working], ["nonWorking", input.nonWorking]] as const).map(([key, raw]) => {
    const amount = raw ?? 0n;
    const reserve = key === "nonWorking" ? input.nonWorkingReserve ?? 0n : workingReserve;
    let status: PoolStatus = "ready";
    if (amount === 0n) status = "empty";
    else if (amount > capacity) status = "cap";
    else if (amount > reserve) status = "reserve";
    if (status === "ready") {
      if (!unlimited) capacity -= amount;
      if (key !== "nonWorking") workingReserve -= amount;
    }
    return { key, amount, status };
  }).filter(pool => pool.key !== "working");
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
    workingReserve: rewards.data?.[15]?.result as bigint | undefined,
    nonWorkingReserve: rewards.data?.[16]?.result as bigint | undefined,
  });
  const history = useIncomeHistory(isMember(participant) ? address : undefined);
  const directReferrals = useDirectReferrals(isMember(participant) ? address : undefined);
  const nonWorkingReentries = rewards.data?.[18]?.result as bigint | undefined;
  const fiveStarWeight = rewards.data?.[19]?.result as bigint | undefined;
  const weeklyDirects = rewards.data?.[20]?.result as bigint | undefined;
  const weeklyCompetition = rewards.data?.[21]?.result as readonly [Address, bigint, boolean] | undefined;
  const singleLegEntries = rewards.data?.[22]?.result as bigint | undefined;
  const singleLegReentries = rewards.data?.[23]?.result as bigint | undefined;
  const nonWorkingEntryCredit = rewards.data?.[24]?.result as bigint | undefined;
  const qualifiedLevel2 = rewards.data?.[25]?.result as bigint | undefined;
  const qualifiedLevel3 = rewards.data?.[26]?.result as bigint | undefined;
  const qualifiedLevel4 = rewards.data?.[27]?.result as bigint | undefined;
  const superstarReserve = rewards.data?.[28]?.result as bigint | undefined;
  useEffect(() => { if (claimReceipt.isSuccess || settleReceipt.isSuccess) void history.refetch(); }, [claimReceipt.isSuccess, settleReceipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps
  // claimable = everything credited − everything withdrawn, so a shortfall means the indexer started late or is behind.
  const historyIncomplete = Boolean(history.data && creditedIncome !== undefined && BigInt(history.data.lifetimeCredited) - BigInt(history.data.claims.gross) < creditedIncome);
  const historyAmount = (reason: string) => history.data ? BigInt(history.data.totals[reason]?.amount ?? "0") : undefined;

  const [tab, setTab] = useState<"overview" | "earnings" | "network" | "royalty">("overview");
  const [copied, setCopied] = useState<"link" | "address">();
  const [networkView, setNetworkView] = useState<"matrix" | "working" | "nonworking" | "single">("matrix");
  const link = address ? `${location.origin}${location.pathname}?ref=${address}` : "";
  const copyText = (value: string, kind: "link" | "address") => { void navigator.clipboard.writeText(value); setCopied(kind); setTimeout(() => setCopied(undefined), 1600); };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: "Join me on Open Protocol", text: "Join my team on Open Protocol.", url: link }); } catch { /* dismissed */ } }
    else copyText(link, "link");
  };
  const shareText = encodeURIComponent(`Join my team on Open Protocol: ${link}`);

  const registered = Boolean(participant?.id);
  const isActive = Number(participant?.directCount ?? 0n) >= 2;
  const fees = claimFees(withdrawable);
  const joined = participant?.joinedAt ? new Date(Number(participant.joinedAt) * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
  const directCount = Number(participant?.directCount ?? 0n);
  const teamCount = Number(team ?? 0n);
  const currentRank = rank ?? 0;
  const nextRank = Math.min(5, currentRank + 1);
  const topRank = currentRank >= 5;
  const rankRequirement = nextRank === 2
    ? { label: "Direct referrals", value: directCount, target: 4, detail: "Four personal referrals" }
    : nextRank === 3
      ? { label: "Level 2 members", value: Number(qualifiedLevel2 ?? 0n), target: 16, detail: "Qualified within your 10-level team" }
      : nextRank === 4
        ? { label: "Level 3 members", value: Number(qualifiedLevel3 ?? 0n), target: 64, detail: "Qualified within your 10-level team" }
        : { label: "Level 4 members", value: Number(qualifiedLevel4 ?? 0n), target: 300, detail: "Qualified within your 10-level team" };
  const rankProgress = topRank ? 100 : Math.min(100, rankRequirement.value / rankRequirement.target * 100);
  const activationProgress = Math.min(100, directCount / 2 * 100);
  const networkName = requiredChainId === 97 ? "BSC Testnet" : "BNB Smart Chain";
  const weekEnds = new Date(Number((currentWeek + 1n) * 7n * 24n * 60n * 60n) * 1000).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  const capLabel = currentRank >= 5 ? "Unlimited" : `${[0, 2, 5, 10, 50][currentRank]}× ticket`;
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

  const tabs = [["overview", "Overview", LayoutGrid], ["earnings", "Earnings", TrendingUp], ["network", "Network", Network], ["royalty", "Royalty Income", Crown]] as const;
  const poolInfo = {
    single: { name: "Single-Leg", note: "Team size + direct referral milestones", tone: "blue", Icon: TrendingUp, level: singleLeg ?? 0, max: 10 },
    working: { name: "Working", note: "Direct distribution", tone: "green", Icon: Layers, level: 0, max: 1 },
    nonWorking: { name: "Non-Working", note: "A new level every 2 team members", tone: "purple", Icon: Network, level: nonWorking ?? 0, max: 15 },
  } as const;
  const visiblePools = teamIncome.pools.filter(pool => pool.key !== "working");
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
  const streamRows = incomeStreams.map(stream => ({ ...stream, amount: historyAmount(stream.reason) ?? 0n, count: history.data?.totals[stream.reason]?.count ?? 0 }));
  const earnedStreams = streamRows.filter(row => row.amount > 0n).sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
  const idleStreams = streamRows.filter(row => row.amount === 0n);
  const sourceTotal = earnedStreams.reduce((sum, row) => sum + row.amount, 0n);
  const royaltyLifetime = historyAmount("FIVE_STAR_ROYALTY") ?? 0n;
  const royaltyPayments = history.data?.totals.FIVE_STAR_ROYALTY?.count ?? 0;
  const royaltyActivity = history.data?.recent.filter(item => item.reason === "FIVE_STAR_ROYALTY") ?? [];
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
        {!isActive && <div className="db-alert"><span><Zap size={18}/></span><div><b>Refer {2 - directCount} more {2 - directCount === 1 ? "member" : "members"} to activate your income</b><p>Until you have 2 direct referrals, your direct income and ten-level upline income are not paid to you.{heldForUpgrade ? ` ${formatToken(heldForUpgrade)} USDT of direct income has been redirected to the pool reserve so far.` : ""}</p></div><button className="db-btn" onClick={() => copyText(link, "link")}>{copied === "link" ? "Link copied" : "Copy invite link"}</button></div>}
        <div className="db-hero-grid">
          <div className="db-balance">
            <div className="db-balance-top"><span>Available balance</span><span className="db-live"><i/> Live</span></div>
            <b className="db-balance-value">{formatToken(withdrawable)} <em>USDT</em></b>
            <p className="db-balance-sub">{withdrawable ? <>You receive <b>{formatToken(fees.net)} USDT</b> after the 20% withdrawal fee.</> : "New rewards are added here automatically."}</p>
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
          <article><span className="db-icon"><Users size={17}/></span><small>Direct referrals</small><b>{directCount}</b><em>{isActive ? "Working Matrix income active" : `${2 - directCount} more to activate income`}</em><div className="kpi-bar"><i style={{ width: `${activationProgress}%` }}/></div></article>
          <article><span className="db-icon"><Network size={17}/></span><small>{topRank ? "Qualified team" : rankRequirement.label}</small><b>{topRank ? Number(qualifiedLevel4 ?? 0n).toLocaleString() : rankRequirement.value.toLocaleString()}</b><em>{topRank ? "Five-Star qualification complete" : `${Math.max(0, rankRequirement.target - rankRequirement.value)} more for ${rankNames[nextRank]}`}</em><div className="kpi-bar"><i style={{ width: `${rankProgress}%` }}/></div></article>
          <article><span className="db-icon"><Award size={17}/></span><small>Current rank</small><b>{rankNames[currentRank]}</b><em>{topRank ? "Highest rank" : `${Math.round(rankProgress)}% to ${rankNames[nextRank]}`}</em><div className="kpi-bar"><i style={{ width: `${rankProgress}%` }}/></div></article>
          <article className="clickable" onClick={() => setTab("earnings")}><span className="db-icon"><Layers size={17}/></span><small>Matrix income</small><b>{formatToken(teamIncome.earned)}<i> USDT</i></b><em>Single-Leg {singleLeg ?? 0}/10 · {singleLegEntries?.toString() ?? 1} entries</em><div className="kpi-bar"><i style={{ width: `${(singleLeg ?? 0) / 10 * 100}%` }}/></div></article>
        </div>

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
              <li><span><em className="snap-icon purple"><Award size={14}/></em>Royalty Club income</span><b>{formatToken(pendingFiveStar)} <small>USDT</small></b></li>
            </ul>
            <div className="db-placement"><span>Matrix parent</span><b className="mono">{placement === undefined ? "—" : placement === zeroAddress ? "Genesis" : shortAddress(placement)}</b><button className="db-text-btn" onClick={() => setTab("network")}>View network <ChevronRight size={14}/></button></div>
          </div>
        </div>

        <div className="db-lifecycle">
          <article><span className="db-icon"><Zap size={16}/></span><small>Single-Leg entries</small><b>{singleLegEntries?.toString() ?? "—"}</b><em>{singleLegReentries?.toString() ?? "0"} automatic re-entry at Level 3</em></article>
          <article><span className="db-icon"><Network size={16}/></span><small>Non-working re-entry</small><b>{nonWorkingReentries?.toString() ?? "—"}</b><em>One cycle per 30 qualified team members</em></article>
          <article><span className="db-icon"><Award size={16}/></span><small>Non-Working entry</small><b>{formatToken(nonWorkingEntryCredit)} <i>USDT</i></b><em>Funded by the 5 USDT Level 2 redirect</em></article>
          <article><span className="db-icon"><ShieldCheck size={16}/></span><small>Pool earning cap</small><b>{capLabel}</b><em>{teamIncome.unlimited ? "No pool cap at this rank" : `${formatToken(teamIncome.capLeft)} USDT capacity remaining`}</em></article>
        </div>

        <div className="db-two">
          <div className="db-card db-directs">
            <div className="db-section-head"><div><small>DIRECT REFERRALS</small><h3>Your personally invited members</h3></div><span className="db-tag">{directReferrals.data?.length ?? directCount}</span></div>
            {directReferrals.isLoading && <p className="db-foot-note">Loading indexed referrals…</p>}
            {directReferrals.isError && <p className="db-warn">The referral history service is unavailable. The on-chain count remains {directCount}.</p>}
            {directReferrals.data?.length === 0 && <p className="db-empty-note">No direct members yet. Share your personal invitation link to begin.</p>}
            {directReferrals.data && directReferrals.data.length > 0 && <ul className="direct-list">{directReferrals.data.slice(0, 8).map(member => <li key={member.address}>
              <span><b>Member #{member.memberId}</b><small>{new Date(member.joinedAt).toLocaleDateString()}</small></span>
              <a className="mono" href={`${explorerUrl}/address/${member.address}`} target="_blank" rel="noreferrer">{shortAddress(member.address)} <ExternalLink size={11}/></a>
            </li>)}</ul>}
            {directReferrals.data && directReferrals.data.length > 8 && <p className="db-foot-note">Showing the first 8 of {directReferrals.data.length} indexed direct members.</p>}
          </div>

          <div className="db-card db-weekly">
            <div className="db-section-head"><div><small>WEEKLY SUPERSTAR</small><h3>Current recruiting week</h3></div><span className="db-tag">Week {currentWeek.toString()}</span></div>
            <div className="weekly-score"><div><small>Your directs</small><b>{weeklyDirects?.toString() ?? "—"}</b></div><div><small>Leading score</small><b>{weeklyCompetition?.[1]?.toString() ?? "—"}</b></div></div>
            <ul className="db-rows">
              <li><span>Current leader</span><b className="mono">{!weeklyCompetition || weeklyCompetition[0] === zeroAddress ? "No leader yet" : weeklyCompetition[0].toLowerCase() === address.toLowerCase() ? "You" : shortAddress(weeklyCompetition[0])}</b></li>
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
          {historyIncomplete && <p className="db-warn">History is still catching up, so these totals may be lower than what you've actually earned. Your balance above is read directly from the contract and is always accurate.</p>}
          {history.isError && <p className="db-warn">Per-source totals come from the history service, which isn't reachable right now. Your balance above is read directly from the contract and is always accurate.</p>}
          {history.isLoading && <div className="src-skeleton"><i/><i/><i/></div>}
          {earnedStreams.length > 0 && <ul className="src-list">{earnedStreams.map(({ reason, name, note, amount, count }) => { const Icon = streamIcon(reason); const pct = sourceTotal ? Number(amount * 1000n / sourceTotal) / 10 : 0; return <li key={reason}>
            <span className="src-icon"><Icon size={16}/></span>
            <div className="src-main">
              <div className="src-top"><b>{name}</b><strong>{formatToken(amount)} <em>USDT</em></strong></div>
              <div className="src-bar"><i style={{ width: `${Math.max(pct, 2)}%` }}/></div>
              <div className="src-meta"><span>{note}</span><span>{count} {count === 1 ? "payment" : "payments"} · {pct.toFixed(pct < 10 ? 1 : 0)}%</span></div>
            </div>
          </li>; })}</ul>}
          {history.data && idleStreams.length > 0 && <div className="src-idle"><small>NOT EARNED YET</small><div>{idleStreams.map(({ reason, name }) => { const Icon = streamIcon(reason); return <span key={reason} title={incomeStreams.find(x => x.reason === reason)?.note}><Icon size={13}/> {name}</span>; })}</div></div>}
          {queued > 0n && <p className="db-foot-note">Plus {formatToken(queued)} USDT of team income still in pools. It's counted here once it moves to your balance.</p>}
          {!isActive && <p className="db-foot-note">Direct and ten-level upline income start once you have 2 direct referrals.{heldForUpgrade ? ` ${formatToken(heldForUpgrade)} USDT has been redirected to the pool reserve so far.` : ""}</p>}
        </div>

        <div className="db-two">
          <div className="db-card db-fee">
            <div className="db-section-head"><div><small>WITHDRAWALS</small><h3>Where each withdrawal goes</h3></div></div>
            <div className="fee-split"><i className="you" style={{ width: "80%" }}><span>80%</span></i><i className="club" style={{ width: "17%" }}><span>17%</span></i><i className="dev" style={{ width: "3%" }}/></div>
            <ul className="fee-rows">
              <li><span><i className="you"/>You receive</span><b>{formatToken(fees.net)} USDT</b></li>
              <li><span><i className="club"/>Royalty Club · 17%</span><b>{formatToken(fees.royalty)} USDT</b></li>
              <li><span><i className="dev"/>Development fund · 3%</span><b>{formatToken(fees.development)} USDT</b></li>
            </ul>
            <div className="fee-total"><span>Next withdrawal</span><b>{formatToken(withdrawable)} <em>USDT</em></b></div>
            {history.data && history.data.claims.count > 0 && <p className="db-foot-note">So far you've withdrawn {formatToken(BigInt(history.data.claims.gross))} USDT and received {formatToken(BigInt(history.data.claims.net))} USDT.</p>}
          </div>
          <div className="db-card db-club">
            <div className="db-section-head"><div><small>ROYALTY CLUB INCOME</small><h3>{currentRank >= 5 ? "You're earning club income" : "Unlock your club share"}</h3></div><span className="club-badge"><Award size={14}/> 5 Star</span></div>
            <div className="club-amount"><small>Club income waiting</small><b>{formatToken(pendingFiveStar)} <em>USDT</em></b><span>Your weighted share is added to your balance automatically when you withdraw</span></div>
            {currentRank < 5 ? <div className="club-reqs">
              <div><div><span>Direct referrals</span><b>{Math.min(directCount, 4)} / 4</b></div><div className="db-bar"><i style={{ width: `${Math.min(100, directCount / 4 * 100)}%` }}/></div></div>
              <div><div><span>Level 4 members</span><b>{Math.min(Number(qualifiedLevel4 ?? 0n), 300).toLocaleString()} / 300</b></div><div className="db-bar"><i style={{ width: `${Math.min(100, Number(qualifiedLevel4 ?? 0n) / 3)}%` }}/></div></div>
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
          {([["matrix", "Global Matrix", `Placement`], ["working", "Working Matrix", `${directCount}/2 activation`], ["nonworking", "Non-Working", `Level ${nonWorking ?? 0}/15`], ["single", "Single Leg", `Level ${singleLeg ?? 0}/10`]] as const).map(([key, label, meta]) => <button key={key} className={networkView === key ? "active" : ""} onClick={() => setNetworkView(key)}><b>{label}</b><span>{meta}</span></button>)}
        </div>
        {networkView === "matrix" && <><div className="view-heading"><div><small>GLOBAL MATRIX</small><h4>Your placement tree</h4></div><p>Everyone enters one shared binary queue and each member holds two positions. Your sponsor and your matrix parent can be different people.</p></div><MatrixTree address={address} parent={placement}/></>}
        {networkView === "working" && <WorkingDistributionPanel directs={directCount} heldForUpgrade={heldForUpgrade}/>}
        {networkView === "nonworking" && <NonWorkingTree address={address} team={team} currentLevel={nonWorking}/>}
        {networkView === "single" && <SingleLegTree address={address} team={team} directs={participant?.directCount} currentLevel={singleLeg}/>}
      </div>}

      {tab === "royalty" && <div className="db-stack">
        <div className="db-summary">
          <div className="primary"><span className="db-sum-icon"><Crown size={16}/></span><small>Royalty income waiting</small><b>{formatToken(pendingFiveStar)} <em>USDT</em></b><span>{currentRank >= 5 ? "Your live, unsettled Royalty Club share" : "Unlocks when you reach the Five-Star rank"}</span><button className="pill" disabled={!withdrawable || claimBusy} onClick={doClaim}>{claimBusy ? "Withdrawing…" : "Withdraw rewards"} {!claimBusy && <ArrowUpRight size={15}/>}</button></div>
          <div><span className="db-sum-icon"><TrendingUp size={16}/></span><small>Lifetime royalty income</small><b>{history.data ? formatToken(royaltyLifetime) : "—"} <em>USDT</em></b><span>{history.data ? `${royaltyPayments} credited ${royaltyPayments === 1 ? "payment" : "payments"}` : "History service unavailable"}</span></div>
          <div><span className="db-sum-icon"><Award size={16}/></span><small>Your royalty weight</small><b>{fiveStarWeight?.toString() ?? "—"}</b><span>One weight at Five-Star, then one more per additional 1,000 team members</span></div>
        </div>
        {actionError && <p className="db-error">{actionError}</p>}

        <div className="db-two">
          <div className="db-card db-club">
            <div className="db-section-head"><div><small>ROYALTY CLUB STATUS</small><h3>{currentRank >= 5 ? "Your club income is active" : "Qualify for Royalty Income"}</h3></div><span className="club-badge"><Crown size={14}/> 5 Star</span></div>
            <div className="club-amount"><small>Current rank</small><b>{rankNames[currentRank]}</b><span>Royalty Club income is distributed by achievement weight among eligible Five-Star members.</span></div>
            {currentRank < 5 ? <div className="club-reqs">
              <div><div><span>Direct referrals</span><b>{Math.min(directCount, 4)} / 4</b></div><div className="db-bar"><i style={{ width: `${Math.min(100, directCount / 4 * 100)}%` }}/></div></div>
              <div><div><span>Level 4 members</span><b>{Math.min(Number(qualifiedLevel4 ?? 0n), 300).toLocaleString()} / 300</b></div><div className="db-bar"><i style={{ width: `${Math.min(100, Number(qualifiedLevel4 ?? 0n) / 3)}%` }}/></div></div>
            </div> : <p className="db-foot-note">Your weight increases automatically whenever your qualified team reaches another 1,000-member milestone.</p>}
          </div>

          <div className="db-card db-fee">
            <div className="db-section-head"><div><small>HOW IT IS FUNDED</small><h3>Withdrawal-funded royalty</h3></div></div>
            <ul className="fee-rows">
              <li><span><i className="club"/>Every reward withdrawal</span><b>17%</b></li>
              <li><span><i className="you"/>Eligibility</span><b>Five-Star rank</b></li>
              <li><span><i className="dev"/>Distribution</span><b>By club weight</b></li>
            </ul>
            <div className="fee-total"><span>Claim behavior</span><b>Automatic</b></div>
            <p className="db-foot-note">Your pending club share is settled into your claimable balance when you withdraw. The same 80% user, 17% club and 3% development split then applies.</p>
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
    </div></section>
  </motion.div>;
}

function WorkingDistributionPanel({ directs, heldForUpgrade }: { directs: number; heldForUpgrade?: bigint }) {
  const active = directs >= 2;
  const rows = [
    ["Sponsor", "80%", "12.00 USDT", "Paid from the third direct onward"],
    ["Sponsor's U1", "10%", "1.50 USDT", "Immediate eligible upline"],
    ["Sponsor's U2", "4%", "0.60 USDT", "Second eligible upline"],
    ["Sponsor's U3", "2%", "0.30 USDT", "Third eligible upline"],
    ["Sponsor's U4–U9", "0.5% each", "0.075 USDT each", "Six eligible upline levels"],
    ["Working reserve", "1%", "0.15 USDT", "Undistributed remainder"],
  ] as const;
  return <div className="progression-view">
    <div className="view-heading"><div><small>15 USDT WORKING MATRIX</small><h4>Direct and nine-level distribution</h4></div><p>Your first two direct referrals activate Working Matrix income. Every direct from the third onward pays the 80% sponsor share.</p></div>
    <div className="db-summary">
      <div className="primary"><span className="db-sum-icon"><Users size={16}/></span><small>Activation progress</small><b>{Math.min(directs, 2)} / 2</b><span>{active ? "Working Matrix income is active" : `${2 - directs} more direct ${2 - directs === 1 ? "referral" : "referrals"} required`}</span></div>
      <div><span className="db-sum-icon"><Coins size={16}/></span><small>Direct income</small><b>12 <em>USDT</em></b><span>80% from every direct after activation</span></div>
      <div><span className="db-sum-icon"><Lock size={16}/></span><small>First-two shares reserved</small><b>{formatToken(heldForUpgrade)} <em>USDT</em></b><span>Up to 24 USDT retained for activation and reserve backing</span></div>
    </div>
    <div className="pool-economics">
      <div className="pool-economics-head"><div><small>PER REGISTRATION</small><h4>Exact 15 USDT distribution</h4></div><div className="pool-selected-summary"><span>Upline eligibility</span><b>2 direct referrals</b></div></div>
      <div className="pool-table-wrap"><table className="pool-table"><thead><tr><th>Recipient</th><th>Share</th><th>Amount</th><th>Rule</th></tr></thead><tbody>{rows.map(([recipient, share, amount, rule]) => <tr key={recipient}><td data-label="Recipient">{recipient}</td><td data-label="Share">{share}</td><td data-label="Amount">{amount}</td><td data-label="Rule">{rule}</td></tr>)}</tbody></table></div>
      <p className="tree-disclaimer">Missing or inactive uplines are not replaced. Their unpaid shares remain in the Working reserve. The Working Matrix distributes 99% and retains 1% per registration.</p>
    </div>
  </div>;
}

type WorkingQuote = readonly [bigint, bigint, bigint, bigint, bigint];
type SingleLegQuote = readonly [bigint, bigint, bigint, bigint, bigint, bigint];

function WorkingTree({ address, team, currentLevel }: { address?: Address; team?: bigint; currentLevel?: number }) {
  const quotes = useReadContracts({
    allowFailure: true,
    contracts: protocolAddress ? Array.from({ length: 8 }, (_, index) => ({ address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "workingLevelQuote" as const, args: [index + 1] as const })) : [],
    query: { enabled: configured, refetchInterval: 60_000, retry: 2 },
  });
  const values = Array.from({ length: 8 }, (_, index) => quotes.data?.[index]?.result as WorkingQuote | undefined);
  return <PoolMatrixPanel kind="working" address={address} team={team} currentLevel={currentLevel} maxLevel={8} quotes={values}/>;
}

function NonWorkingTree({ address, team, currentLevel }: { address?: Address; team?: bigint; currentLevel?: number }) {
  const quotes = useReadContracts({
    allowFailure: true,
    contracts: protocolAddress ? Array.from({ length: 15 }, (_, index) => ({ address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "nonWorkingLevelQuote" as const, args: [index + 1] as const })) : [],
    query: { enabled: configured, refetchInterval: 60_000, retry: 2 },
  });
  const values = Array.from({ length: 15 }, (_, index) => quotes.data?.[index]?.result as WorkingQuote | undefined);
  return <PoolMatrixPanel kind="nonworking" address={address} team={team} currentLevel={currentLevel} maxLevel={15} quotes={values}/>;
}

function PoolMatrixPanel({ kind, address, team, currentLevel = 0, maxLevel, quotes }: {
  kind: "working" | "nonworking"; address?: Address; team?: bigint; currentLevel?: number; maxLevel: number; quotes: (WorkingQuote | undefined)[];
}) {
  const initialLevel = Math.min(maxLevel, Math.max(1, currentLevel + 1));
  const [selectedLevel, setSelectedLevel] = useState(initialLevel);
  useEffect(() => { setSelectedLevel(Math.min(maxLevel, Math.max(1, currentLevel + 1))); }, [currentLevel, maxLevel]);
  const teamValue = Number(team ?? 0n);
  const quote = quotes[selectedLevel - 1];
  const required = Number(quote?.[0] ?? BigInt(selectedLevel * 2));
  const positions = [selectedLevel * 2 - 1, selectedLevel * 2];
  const filledInLevel = positions.filter(position => teamValue >= position).length;
  const reached = currentLevel >= selectedLevel;
  const current = !reached && selectedLevel === currentLevel + 1;
  const title = kind === "working" ? "Working Matrix" : "Non-Working Matrix";
  const tone = kind === "working" ? "working" : "nonworking";

  return <div className={`pool-matrix-view ${tone}`}>
    <div className="pool-matrix-focus">
      <div className="pool-position-card">
        <span className="pool-avatar">{kind === "working" ? "W" : "N"}</span>
        <div><small>YOUR MATRIX POSITION</small><b>{address ? shortAddress(address) : "Connect wallet"}</b></div>
        <strong>Level {selectedLevel}</strong>
      </div>
      <div className="pool-connector"/>
      <div className="pool-completion"><span>Completion positions</span><b>{filledInLevel}/2 toward automatic advancement</b></div>
      <div className="pool-branch">
        {positions.map((position, index) => {
          const filled = teamValue >= position;
          return <div className={`pool-position ${filled ? "filled" : "available"}`} key={position}><i>{filled ? <Check size={18}/> : index + 1}</i><b>{filled ? "FILLED" : "AVAILABLE"}</b><small>Team position {position}</small></div>;
        })}
      </div>
      <div className="pool-level-copy">
        <b>{filledInLevel} of 2 positions filled in this {kind === "working" ? "Working" : "Non-Working"} level</b>
        <span>{reached ? "Level completed" : current ? "Position awaiting activation" : `Complete Level ${selectedLevel - 1} first`}</span>
      </div>
      <div className="pool-focus-progress"><i style={{ width: `${filledInLevel * 50}%` }}/></div>
      <p>Positions are calculated from your qualified sponsor-tree count. Select any contract level below to inspect its requirements and economics.</p>
    </div>

    <div className="pool-economics">
      <div className="pool-economics-head"><div><small>CONTRACT-VERIFIED ECONOMICS</small><h4>{title}</h4></div><div className="pool-selected-summary"><span>Selected Level {selectedLevel}</span><b>{required} team required</b></div></div>
      <div className="pool-table-wrap"><table className="pool-table"><thead><tr><th>Level</th><th>Team</th><th>ID amount</th><th>Turnover</th><th>Auto upgrade</th><th>Distributable</th><th>Status</th></tr></thead><tbody>
        {Array.from({ length: maxLevel }, (_, index) => {
          const level = index + 1;
          const row = quotes[index];
          const rowReached = currentLevel >= level;
          const rowCurrent = !rowReached && level === currentLevel + 1;
          return <tr key={level} className={`${selectedLevel === level ? "selected" : ""} ${rowReached ? "reached" : rowCurrent ? "current" : "locked"}`} onClick={() => setSelectedLevel(level)} tabIndex={0} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelectedLevel(level); }}>
            <td data-label="Level"><span className="pool-td-level">Level </span>{level}</td><td data-label="Team">{Number(row?.[0] ?? BigInt(level * 2))}</td><td data-label="ID amount">{formatToken(row?.[1])} USDT</td><td data-label="Turnover">{formatToken(row?.[2])} USDT</td><td data-label="Auto upgrade">{formatToken(row?.[3])} USDT</td><td data-label="Distributable">{formatToken(row?.[4])} USDT</td><td data-label="Status"><span className="pool-status">{rowReached ? "Complete" : rowCurrent ? "In progress" : "Locked"}</span></td>
          </tr>;
        })}
      </tbody></table></div>
      <p className="tree-disclaimer">All thresholds and monetary values are read from the deployed contract. The matrix shows progress positions, while placement relationships remain in the Global Matrix tab.</p>
    </div>
  </div>;
}

/** Published Single-Leg table, used until the contract's `singleLegQuote` reads arrive. Whole USDT. */
const SINGLE_LEG_TABLE = [
  [10, 1, 10, 5, 1], [15, 1, 15, 5, 2], [30, 2, 26, 9, 3], [60, 2, 50, 0, 5], [250, 2, 150, 0, 10],
  [600, 3, 500, 0, 30], [1_000, 3, 1_500, 0, 100], [1_500, 3, 3_500, 0, 400], [2_500, 4, 10_000, 0, 1_000], [3_700, 4, 15_000, 0, 2_500],
] as const;
const usdt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function SingleLegTree({ address, team, directs, currentLevel }: { address?: Address; team?: bigint; directs?: bigint; currentLevel?: number }) {
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
  const teamValue = Number(team ?? 0n);
  const directValue = Number(directs ?? 0n);
  const done = currentLevel ?? 0;
  const next = levels[done];
  const netReward = (level: typeof levels[number]) => level.level === 1 ? level.income + level.extra : level.income;
  const allocationNote = (level: typeof levels[number]) => level.level === 1 ? `incl. ${usdt(level.extra)} USDT Level 1 bonus` : level.level === 2 ? `${usdt(level.extra)} USDT → Non-Working Matrix` : level.level === 3 ? `${usdt(level.extra)} USDT → automatic re-entry` : undefined;
  const earned = levels.slice(0, done).reduce((sum, level) => sum + netReward(level), 0);
  const remaining = levels.slice(done).reduce((sum, level) => sum + netReward(level), 0);
  const teamLeft = next ? Math.max(0, next.members - teamValue) : 0;
  const directsLeft = next ? Math.max(0, next.directs - directValue) : 0;
  const todo = [
    teamLeft > 0 && `grow your team by ${teamLeft.toLocaleString()} ${teamLeft === 1 ? "member" : "members"}`,
    directsLeft > 0 && `personally invite ${directsLeft} more ${directsLeft === 1 ? "person" : "people"}`,
  ].filter(Boolean) as string[];
  const bar = (have: number, need: number) => <div className="sl-bar"><i style={{ width: `${need ? Math.min(100, have / need * 100) : 100}%` }}/></div>;

  return <div className="progression-view sl">
    <div className="sl-explain">
      <div><span>1</span><b>Grow your team</b><p>Everyone who joins under you, up to 10 levels deep, counts toward your team.</p></div>
      <div><span>2</span><b>Invite people yourself</b><p>Each level also needs a few members you referred directly.</p></div>
      <div><span>3</span><b>Unlock a one-time reward</b><p>When both targets are met, the level's reward is added to your team income automatically.</p></div>
    </div>

    {next ? <div className="sl-next">
      <div className="sl-next-head">
        <div><small>YOUR NEXT GOAL</small><h4>Level {next.level} <em>of 10</em></h4></div>
        <div className="sl-reward"><small>NET REWARD</small><b>{usdt(netReward(next))} <em>USDT</em></b></div>
      </div>
      <div className="sl-req">
        <div className={teamLeft === 0 ? "ok" : ""}><div><span><Users size={15}/> Team size</span><b>{Math.min(teamValue, next.members).toLocaleString()} / {next.members.toLocaleString()}</b></div>{bar(teamValue, next.members)}<small>{teamLeft === 0 ? <><Check size={12}/> Target met</> : `${teamLeft.toLocaleString()} more needed`}</small></div>
        <div className={directsLeft === 0 ? "ok" : ""}><div><span><UserRoundCheck size={15}/> Direct referrals</span><b>{Math.min(directValue, next.directs)} / {next.directs}</b></div>{bar(directValue, next.directs)}<small>{directsLeft === 0 ? <><Check size={12}/> Target met</> : `${directsLeft} more needed`}</small></div>
      </div>
      <p className="sl-todo"><Zap size={15}/><span>{address ? <>To unlock <b>{usdt(netReward(next))} USDT</b>, {todo.join(" and ")}.{allocationNote(next) ? ` ${allocationNote(next)}.` : ""}</> : "Connect your wallet to see your progress."}</span></p>
    </div> : <div className="sl-next sl-complete"><Award size={22}/><div><h4>All 10 levels complete</h4><p>You have unlocked every Single-Leg reward.</p></div></div>}

    <div className="sl-summary">
      <div><small>LEVELS DONE</small><b>{done} / 10</b></div>
      <div><small>UNLOCKED SO FAR</small><b>{usdt(earned)} <em>USDT</em></b></div>
      <div><small>STILL AVAILABLE</small><b>{usdt(remaining)} <em>USDT</em></b></div>
    </div>

    <div className="sl-table" role="table" aria-label="Single-Leg levels">
      <div className="sl-row sl-th" role="row"><span>Level</span><span>Team needed</span><span>Direct referrals</span><span>Your reward</span><span>Status</span></div>
      {levels.map(l => {
        const state = l.level <= done ? "done" : l.level === done + 1 ? "next" : "locked";
        return <div className={`sl-row ${state}`} role="row" key={l.level}>
          <span className="sl-lvl"><i>{state === "done" ? <Check size={13}/> : l.level}</i><em>Level {l.level}</em></span>
          <span data-label="Team">{l.members.toLocaleString()}</span>
          <span data-label="Directs">{l.directs}</span>
          <span data-label="Reward" className="sl-amt"><span>{usdt(netReward(l))} USDT{allocationNote(l) && <small>{allocationNote(l)}</small>}</span></span>
          <span className="sl-status">{state === "done" ? "Unlocked" : state === "next" ? "In progress" : "Locked"}</span>
        </div>;
      })}
    </div>

    <div className="sl-bonus"><Users size={16}/><p><b>Bonus for your sponsors.</b> Each time someone you invited (or someone they invited) unlocks a level, you also receive an upline bonus — from {usdt(levels[0].upline)} USDT at level 1 up to {usdt(levels[9].upline)} USDT at level 10. You need at least 2 direct referrals to receive it.</p></div>
    <p className="tree-disclaimer">Single-Leg rewards are queued as team income. Use “Move to balance” on the Earnings tab to add them to your claimable balance; the amount you can move is limited by your rank cap and the pool reserve.</p>
  </div>;
}

function MatrixTree({ address, parent }: { address?: Address; parent?: Address }) {
  const [selectedRoot, setSelectedRoot] = useState<Address | undefined>(address);
  useEffect(() => { setSelectedRoot(address); }, [address]);
  const { tree, loading, filled, failed } = useMatrixTree(selectedRoot);
  const selectedParentRead = useReadContract({
    address: protocolAddress ?? zeroAddress,
    abi: protocolAbi,
    chainId: requiredChainId,
    functionName: "matrixParent",
    args: [selectedRoot ?? zeroAddress],
    query: { enabled: Boolean(protocolAddress && selectedRoot && selectedRoot !== address), refetchInterval: 12_000 },
  });
  if (!address) return <div className="empty">Connect a wallet to see your position in the matrix.</div>;
  const activeRoot = selectedRoot ?? address;
  const selectedParent = activeRoot === address ? parent : selectedParentRead.data;
  const root: MatrixNode = tree ?? { address: activeRoot, children: [null, null] };
  return <div className="tree-wrap">
    <div className="tree-browser"><div><small>VIEWING MATRIX ROOT</small><b>{activeRoot === address ? "Your position" : shortAddress(activeRoot)}</b></div>{activeRoot !== address && <button className="db-btn" onClick={() => setSelectedRoot(address)}>Back to my tree</button>}</div>
    <div className="tree-meta"><span>{loading ? "Reading the matrix…" : configured ? `${filled} of 14 visible positions filled · select a member to explore` : "Awaiting deployment"}</span><span className="tree-legend"><i className="slot-key you"/>Your wallet<i className="slot-key member"/>Member<i className="slot-key open"/>Open</span></div>
    <div className="tree-progress" aria-label={`${filled} of 14 visible matrix positions filled`}><span style={{ width: `${filled / 14 * 100}%` }}/></div>
    {failed > 0 && <p className="tree-warning">{failed} on-chain {failed === 1 ? "read" : "reads"} could not be completed. Successful branches remain visible and failed reads retry automatically.</p>}
    <div className="tree">
      <div className="tnode parent"><div className="slot ghost"><small>Matrix parent</small><b>{selectedParent === undefined ? "—" : selectedParent === zeroAddress ? "Genesis" : shortAddress(selectedParent)}</b></div></div>
      <TreeNode node={root} depth={0} self={address} onSelect={setSelectedRoot}/>
    </div>
  </div>;
}

function TreeNode({ node, depth, self, onSelect }: { node: MatrixNode | null; depth: number; self: Address; onSelect: (address: Address) => void }) {
  const leaf = depth >= 3;
  return <div className="tnode">
    {node ? <button onClick={() => onSelect(node.address)} className={`slot ${node.address.toLowerCase() === self.toLowerCase() ? "you" : "member"}`}><small>{node.address.toLowerCase() === self.toLowerCase() ? "You" : node.id ? `No. ${node.id.toString()}` : "Member"}</small><b>{shortAddress(node.address)}</b><em className="slot-tail">…{node.address.slice(-4)}</em></button> : <div className="slot open"><small>Open</small><b>Level {depth}</b></div>}
    {!leaf && <div className="kids"><TreeNode node={node?.children[0] ?? null} depth={depth + 1} self={self} onSelect={onSelect}/><TreeNode node={node?.children[1] ?? null} depth={depth + 1} self={self} onSelect={onSelect}/></div>}
  </div>;
}

function Mechanics() { return <motion.div {...fade}>
    <section className="page-hero"><div className="wrap center"><p className="eyebrow">Mechanics</p><h1>Facts.<br/><span className="grad">Kept apart from claims.</span></h1><p className="sub">Only rules that reconcile with the source document are executable. Everything else waits for written clarification.</p></div></section>
    <section className="band gray">
      <div className="wrap-wide bento three">{[
        ["A single $25 ticket.", "The source document defines one USDT ticket, settled on BNB Smart Chain."],
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
