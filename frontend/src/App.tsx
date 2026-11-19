import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowRight, ArrowUpRight, Award, Calendar, Check, ChevronRight, Clock, Coins, Copy, ExternalLink, Eye, Fuel, Layers, LayoutGrid, Lock, MessageCircle, Network, Send, Share2, ShieldCheck, TrendingUp, UserRoundCheck, Users, Wallet, WalletCards, Zap } from "lucide-react";
import { decodeFunctionResult, encodeFunctionData, isAddress, zeroAddress, type Address } from "viem";
import { useAccount, useBalance, useReadContract, useReadContracts, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { chainId as requiredChainId, deploymentError, explorerUrl, genesisSponsor, protocolAddress, testTokenAddress, walletConnectEnabled } from "./config";
import { erc20Abi, mockUsdtAbi, protocolAbi } from "./contracts/abi";
import { useUi } from "./store/ui";
import { formatToken, shortAddress } from "./utils/format";
import { useMatrixTree, type MatrixNode } from "./matrix";
import { incomeName, incomeStreams, useIncomeHistory } from "./income";

const allocation = [
  { name: "Working pool", value: 15, tone: "blue", note: "Funds direct-referral and upline income across the working levels." },
  { name: "Non-working pool", value: 9, tone: "green", note: "Funds matrix income paid to the matrix parent and uplines, independent of referrals." },
  { name: "Five-star club", value: 1, tone: "purple", note: "Reserved for members who reach the five-star rank, shared per achievement." },
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

  return <div className="shell">
    <header className="globalnav">
      <div className="globalnav-inner">
        <button className="wordmark" onClick={() => setView("overview")}>Open Protocol</button>
        <nav>{nav.map(([key, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}</nav>
        <div className="globalnav-right"><GetTestUsdtButton/><ConnectButton accountStatus="address" chainStatus="none" showBalance={false} label="Connect"/></div>
      </div>
    </header>

    {!configured && <div className={`ribbon ${deploymentError ? "ribbon-warn" : ""}`}>{deploymentError ?? <>Interface ready. Set <code>VITE_PROTOCOL_ADDRESS</code> after deployment and live reads and transactions switch on.</>}</div>}
    {!walletConnectEnabled && !isConnected && <div className="ribbon">Connect any injected EVM wallet. On mobile, open this page inside SafePal, MetaMask, Trust Wallet, Binance Wallet, or another wallet's DApp browser.</div>}
    {isConnected && currentChain !== requiredChainId && <button className="ribbon ribbon-warn" onClick={() => switchChain({ chainId: requiredChainId })}>This wallet is on another network. Switch to BNB Smart Chain <ChevronRight size={14}/></button>}

    <main>
      <AnimatePresence mode="wait">
        {view === "overview" && <Overview key="overview" memberCount={memberCount} total={total} ticket={ticket} invariant={invariant} registered={isRegistered} onParticipate={() => setView("participate")} onDashboard={() => setView("referrals")} onMechanics={() => setView("mechanics")}/>}
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
        <div className="footer-row"><span>Open Protocol</span><span>Immutable core</span><span>BNB Smart Chain</span><span>USDT, BEP-20</span></div>
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

function Overview({ memberCount, total, ticket, invariant, registered, onParticipate, onDashboard, onMechanics }: { memberCount?: bigint; total?: bigint; ticket?: bigint; invariant?: boolean; registered: boolean; onParticipate: () => void; onDashboard: () => void; onMechanics: () => void }) {
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
            <button className="pill" onClick={primary.onClick}>{primary.label} <ArrowRight size={17}/></button>
            <button className="home-ghost" onClick={() => scrollTo("how-it-works")}>How it works</button>
          </div>
          <div className="hero-trust"><span><Check size={13}/> {price} USDT one-time entry</span><span><Check size={13}/> Non-custodial</span><span><Check size={13}/> Open-source contract</span></div>
        </div>
        <div className="split-card home-hero-card">
          <div className="split-total"><span>EVERY REGISTRATION</span><b>{price} <em>USDT</em></b></div>
          <div className="split-bar">{allocation.map(a => <i key={a.name} className={a.tone} style={{ flex: a.value }}/>)}</div>
          <ul>{allocation.map(a => <li key={a.name}><span><i className={a.tone}/>{a.name}</span><b>{a.value}.00 USDT</b></li>)}</ul>
          <div className="split-check"><Check size={15}/> Split atomically by the contract</div>
        </div>
      </div>
    </section>

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
        <button className="pill" onClick={primary.onClick}>{primary.label} <ArrowRight size={17}/></button>
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
const directRequirements = [0, 4, 8, 12, 16, 16];
const teamRequirements = [0, 0, 16, 64, 300, 1_000];

const isMember = (participant?: { id: bigint }) => Boolean(participant?.id);

/** Mirrors `claim()`: 17% to the Five-Star club and 3% to development are taken from the gross amount. */
function claimFees(gross?: bigint) {
  const value = gross ?? 0n;
  const royalty = value * 1_700n / 10_000n;
  const development = value * 300n / 10_000n;
  return { royalty, development, net: value - royalty - development };
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
  const history = useIncomeHistory(isMember(participant) ? address : undefined);
  useEffect(() => { if (claimReceipt.isSuccess || settleReceipt.isSuccess) void history.refetch(); }, [claimReceipt.isSuccess, settleReceipt.isSuccess]); // eslint-disable-line react-hooks/exhaustive-deps
  // claimable = everything credited − everything withdrawn, so a shortfall means the indexer started late or is behind.
  const historyIncomplete = Boolean(history.data && creditedIncome !== undefined && BigInt(history.data.lifetimeCredited) - BigInt(history.data.claims.gross) < creditedIncome);
  const historyAmount = (reason: string) => history.data ? BigInt(history.data.totals[reason]?.amount ?? "0") : undefined;

  const [tab, setTab] = useState<"overview" | "earnings" | "network">("overview");
  const [copied, setCopied] = useState<"link" | "address">();
  const [networkView, setNetworkView] = useState<"matrix" | "working" | "single">("matrix");
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
  const directNeed = directRequirements[nextRank];
  const teamNeed = teamRequirements[nextRank];
  const directProgress = directNeed ? Math.min(100, directCount / directNeed * 100) : 100;
  const teamProgress = teamNeed ? Math.min(100, teamCount / teamNeed * 100) : 100;
  const rankProgress = topRank ? 100 : Math.min(directProgress, teamProgress);
  const networkName = requiredChainId === 97 ? "BSC Testnet" : "BNB Smart Chain";
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

  const tabs = [["overview", "Overview", LayoutGrid], ["earnings", "Earnings", TrendingUp], ["network", "Network", Network]] as const;
  const poolRows = [
    { name: "Single-Leg Pool", note: "Milestone income from team + direct growth", value: pendingSingleLeg, tone: "blue" },
    { name: "Working Pool", note: "Level income unlocked by team growth", value: pendingWorking, tone: "green" },
    { name: "Non-Working Pool", note: "Matrix income from your placement", value: pendingNonWorking, tone: "purple" },
  ];

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
              <div><small><Clock size={12}/> Waiting in pools</small><b>{formatToken(queued)} USDT</b></div>
              <button className="db-btn" disabled={queued === 0n || settleBusy} onClick={doSettle}>{settle.isPending ? "Confirm in wallet…" : settleReceipt.isLoading ? "Settling…" : "Move to balance"}</button>
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
          <article><span className="db-icon"><Users size={17}/></span><small>Direct referrals</small><b>{directCount}</b><em>{topRank ? "Top rank reached" : directCount >= directNeed ? "Requirement met" : `${directNeed - directCount} more for ${rankNames[nextRank]}`}</em></article>
          <article><span className="db-icon"><Network size={17}/></span><small>Total team</small><b>{teamCount.toLocaleString()}</b><em>Everyone in your downline</em></article>
          <article><span className="db-icon"><Award size={17}/></span><small>Current rank</small><b>{rankNames[currentRank]}</b><em>{topRank ? "Highest rank" : `Next: ${rankNames[nextRank]}`}</em></article>
          <article><span className="db-icon"><Layers size={17}/></span><small>Pool levels</small><b>{working ?? 0}<i>/8</i> · {singleLeg ?? 0}<i>/10</i></b><em>Working · Single-Leg</em></article>
        </div>

        <div className="db-two">
          <div className="db-card">
            <div className="db-section-head"><div><small>RANK PROGRESS</small><h3>{topRank ? "You've reached 5 Star" : `On your way to ${rankNames[nextRank]}`}</h3></div><b className="db-percent">{Math.round(rankProgress)}%</b></div>
            <div className="db-ranks">{rankNames.map((name, index) => <div key={name} className={index <= currentRank ? "reached" : index === nextRank && !topRank ? "next" : ""}><i>{index <= currentRank ? <Check size={11}/> : null}</i><span>{name}</span></div>)}</div>
            {!topRank && <div className="db-reqs">
              <div><div><span>Direct referrals</span><b>{Math.min(directCount, directNeed)} / {directNeed}</b></div><div className="db-bar"><i style={{ width: `${directProgress}%` }}/></div><small>{directCount >= directNeed ? "Done" : `${directNeed - directCount} more needed`}</small></div>
              <div><div><span>Team size</span><b>{Math.min(teamCount, teamNeed)} / {teamNeed}</b></div><div className="db-bar"><i style={{ width: `${teamProgress}%` }}/></div><small>{teamCount >= teamNeed ? "Done" : `${teamNeed - teamCount} more needed`}</small></div>
            </div>}
            <p className="db-foot-note">{topRank ? "Your Five-Star share keeps growing with your team." : "Both requirements must be met before the contract upgrades your rank."}</p>
          </div>

          <div className="db-card">
            <div className="db-section-head"><div><small>EARNINGS SNAPSHOT</small><h3>Where your rewards are</h3></div><button className="db-text-btn" onClick={() => setTab("earnings")}>Details <ChevronRight size={14}/></button></div>
            <ul className="db-rows">
              <li><span><i className="green"/>Available to withdraw</span><b>{formatToken(withdrawable)} USDT</b></li>
              <li><span><i className="blue"/>Waiting in pools</span><b>{formatToken(queued)} USDT</b></li>
              <li><span><i className="purple"/>Five-Star royalty</span><b>{formatToken(pendingFiveStar)} USDT</b></li>
            </ul>
            <div className="db-placement"><span>Matrix parent</span><b className="mono">{placement === undefined ? "—" : placement === zeroAddress ? "Genesis" : shortAddress(placement)}</b><button className="db-text-btn" onClick={() => setTab("network")}>View network <ChevronRight size={14}/></button></div>
          </div>
        </div>
      </div>}

      {tab === "earnings" && <div className="db-stack">
        <div className="db-summary">
          <div className="primary"><small>Available to withdraw</small><b>{formatToken(withdrawable)} <em>USDT</em></b><span>You receive {formatToken(fees.net)} USDT after fees</span><button className="pill" disabled={!withdrawable || claimBusy} onClick={doClaim}>{claimBusy ? "Withdrawing…" : "Withdraw"}</button></div>
          <div><small>Waiting in pools</small><b>{formatToken(queued)} <em>USDT</em></b><span>Settle to add it to your balance</span><button className="db-btn" disabled={queued === 0n || settleBusy} onClick={doSettle}>{settleBusy ? "Settling…" : "Move to balance"}</button></div>
          <div><small>Lifetime earned</small><b>{history.data ? formatToken(BigInt(history.data.lifetimeCredited)) : "—"} <em>USDT</em></b><span>{history.data ? `${formatToken(BigInt(history.data.claims.net))} USDT received in ${history.data.claims.count} ${history.data.claims.count === 1 ? "withdrawal" : "withdrawals"}` : "History service unavailable"}</span></div>
        </div>
        {actionError && <p className="db-error">{actionError}</p>}

        <div className="db-card">
          <div className="db-section-head"><div><small>INCOME BY SOURCE</small><h3>Everything you've earned</h3></div>{history.data && !historyIncomplete && <span className="db-tag">Lifetime</span>}</div>
          {historyIncomplete && <p className="db-warn">History is still catching up, so these totals may be lower than what you've actually earned. Your balance above is read directly from the contract and is always accurate.</p>}
          {history.isError && <p className="db-warn">Per-source totals come from the history service, which isn't reachable right now. Your balance above is read directly from the contract and is always accurate.</p>}
          <ul className="db-rows tall db-income-list">{incomeStreams.map(({ reason, name, note }) => {
            const amount = historyAmount(reason);
            const count = history.data?.totals[reason]?.count ?? 0;
            return <li key={reason} className={amount ? "" : "zero"}><span><i className={amount ? "green" : ""}/><div><b>{name}</b><em>{note}{count ? ` · ${count} ${count === 1 ? "payment" : "payments"}` : ""}</em></div></span><b>{amount === undefined ? (history.isLoading ? "…" : "—") : `${formatToken(amount)} USDT`}</b></li>;
          })}</ul>
          {!isActive && <p className="db-foot-note">Direct and ten-level upline income start once you have 2 direct referrals.{heldForUpgrade ? ` ${formatToken(heldForUpgrade)} USDT has been redirected to the pool reserve so far.` : ""}</p>}
        </div>

        <div className="db-two">
          <div className="db-card">
            <div className="db-section-head"><div><small>POOL INCOME</small><h3>Waiting to be settled</h3></div></div>
            <ul className="db-rows tall">{poolRows.map(row => <li key={row.name}><span><i className={row.tone}/><div><b>{row.name}</b><em>{row.note}</em></div></span><b>{formatToken(row.value)} USDT</b></li>)}
              <li><span><i className="purple"/><div><b>Five-Star Royalty</b><em>Added to your balance when you withdraw</em></div></span><b>{formatToken(pendingFiveStar)} USDT</b></li>
            </ul>
            <p className="db-foot-note">Pool income is only paid out up to your rank's earnings cap and while the pool reserve can cover it.</p>
          </div>
          <div className="db-card">
            <div className="db-section-head"><div><small>WITHDRAWALS</small><h3>How the 20% fee works</h3></div></div>
            <ul className="db-rows">
              <li><span>Next withdrawal</span><b>{formatToken(withdrawable)} USDT</b></li>
              <li><span>Five-Star club (17%)</span><b>−{formatToken(fees.royalty)} USDT</b></li>
              <li><span>Development fund (3%)</span><b>−{formatToken(fees.development)} USDT</b></li>
              <li className="db-total-row"><span>You receive</span><b>{formatToken(fees.net)} USDT</b></li>
            </ul>
            {history.data && history.data.claims.count > 0 && <p className="db-foot-note">So far you've withdrawn {formatToken(BigInt(history.data.claims.gross))} USDT and received {formatToken(BigInt(history.data.claims.net))} USDT.</p>}
          </div>
        </div>

        {history.data && history.data.recent.length > 0 && <div className="db-card">
          <div className="db-section-head"><div><small>RECENT ACTIVITY</small><h3>Latest rewards</h3></div></div>
          <ul className="db-rows db-activity">{history.data.recent.slice(0, 10).map(item => <li key={`${item.txHash}-${item.reason}-${item.amount}`}><span><i className="green"/>{incomeName(item.reason)}</span><a href={`${explorerUrl}/tx/${item.txHash}`} target="_blank" rel="noreferrer">+{formatToken(BigInt(item.amount))} USDT <ExternalLink size={11}/></a></li>)}</ul>
        </div>}
      </div>}

      {tab === "network" && <div className="tile matrix dashboard-network db-network">
        <div className="db-seg" role="tablist" aria-label="Network system">
          {([["matrix", "Global Matrix", `Placement`], ["working", "Working Pool", `Level ${working ?? 0}/8`], ["single", "Single Leg", `Level ${singleLeg ?? 0}/10`]] as const).map(([key, label, meta]) => <button key={key} className={networkView === key ? "active" : ""} onClick={() => setNetworkView(key)}><b>{label}</b><span>{meta}</span></button>)}
        </div>
        {networkView === "matrix" && <><div className="view-heading"><div><small>GLOBAL MATRIX</small><h4>Your placement tree</h4></div><p>Everyone enters one shared binary queue and each member holds two positions. Your sponsor and your matrix parent can be different people.</p></div><MatrixTree address={address} parent={placement}/></>}
        {networkView === "working" && <WorkingTree address={address} team={team} currentLevel={working}/>}
        {networkView === "single" && <SingleLegTree address={address} team={team} directs={participant?.directCount} currentLevel={singleLeg}/>}
        <p className="db-foot-note">Non-working level: {nonWorking ?? 0}</p>
      </div>}
    </div></section>
  </motion.div>;
}

type WorkingQuote = readonly [bigint, bigint, bigint, bigint, bigint];
type SingleLegQuote = readonly [bigint, bigint, bigint, bigint, bigint, bigint];

function WorkingTree({ address, team, currentLevel }: { address?: Address; team?: bigint; currentLevel?: number }) {
  const quotes = useReadContracts({
    allowFailure: true,
    contracts: protocolAddress ? Array.from({ length: 8 }, (_, index) => ({ address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "workingLevelQuote" as const, args: [index + 1] as const })) : [],
    query: { enabled: configured, refetchInterval: 60_000, retry: 2 },
  });
  const teamValue = Number(team ?? 0n);
  return <div className="progression-view">
    <div className="view-heading"><div><small>WORKING POOL</small><h4>Team growth unlocks levels</h4></div><p>Every two additional team members unlock the next level. The contract calculates the turnover, reserves the next upgrade, and queues the remainder.</p></div>
    <div className="logic-strip"><div><b>1</b><span>Team grows</span><small>All downline members count</small></div><i/><div><b>2</b><span>Threshold reached</span><small>2, 4, 6… members</small></div><i/><div><b>3</b><span>Reward queued</span><small>Settle when backed</small></div></div>
    <div className="progression-owner"><span className="owner-mark">W</span><div><small>WORKING POOL</small><b>{address ? shortAddress(address) : "Connect wallet"}</b></div><strong>Level {currentLevel ?? 0} / 8</strong></div>
    <div className="progression-stem"/>
    <div className="working-levels">{Array.from({ length: 8 }, (_, index) => {
      const level = index + 1;
      const quote = quotes.data?.[index]?.result as WorkingQuote | undefined;
      const required = Number(quote?.[0] ?? BigInt(level * 2));
      const reached = (currentLevel ?? 0) >= level;
      const current = !reached && level === (currentLevel ?? 0) + 1;
      const progress = Math.min(100, required ? teamValue / required * 100 : 0);
      return <div className={`level-card ${reached ? "reached" : current ? "current" : ""}`} key={level}>
        <div className="level-top"><span>LEVEL {level}</span><b>{reached ? "Reached" : current ? "In progress" : "Locked"}</b></div>
        <strong>{required} team members</strong>
        <p>ID amount {formatToken(quote?.[1])} USDT · {formatToken(quote?.[4])} distributable</p>
        <div className="level-progress"><i style={{ width: `${reached ? 100 : current ? progress : 0}%` }}/></div>
        <small>{reached ? `${required}/${required} complete` : current ? `${Math.min(teamValue, required)}/${required} members` : `Unlock after Level ${level - 1}`}</small>
      </div>;
    })}</div>
    <p className="tree-disclaimer">Working levels advance automatically when the on-chain team count reaches each threshold. Amounts are read from the deployed contract.</p>
  </div>;
}

function SingleLegTree({ address, team, directs, currentLevel }: { address?: Address; team?: bigint; directs?: bigint; currentLevel?: number }) {
  const quotes = useReadContracts({
    allowFailure: true,
    contracts: protocolAddress ? Array.from({ length: 10 }, (_, index) => ({ address: protocolAddress, abi: protocolAbi, chainId: requiredChainId, functionName: "singleLegQuote" as const, args: [index + 1] as const })) : [],
    query: { enabled: configured, refetchInterval: 60_000, retry: 2 },
  });
  const teamValue = Number(team ?? 0n);
  const directValue = Number(directs ?? 0n);
  return <div className="progression-view single-view">
    <div className="view-heading"><div><small>SINGLE LEG</small><h4>Two requirements move together</h4></div><p>A milestone completes only when you have both the required total team and the required number of personally sponsored members.</p></div>
    <div className="logic-strip"><div><b>1</b><span>Build your team</span><small>All downline members</small></div><i/><div><b>+</b><span>Add directs</span><small>Your personal referrals</small></div><i/><div><b>3</b><span>Complete level</span><small>Both must be satisfied</small></div></div>
    <div className="progression-owner"><span className="owner-mark single">S</span><div><small>SINGLE LEG</small><b>{address ? shortAddress(address) : "Connect wallet"}</b></div><strong>Level {currentLevel ?? 0} / 10</strong></div>
    <div className="single-path">{Array.from({ length: 10 }, (_, index) => {
      const level = index + 1;
      const quote = quotes.data?.[index]?.result as SingleLegQuote | undefined;
      const members = Number(quote?.[0] ?? 0n);
      const directNeed = Number(quote?.[1] ?? 0n);
      const reached = (currentLevel ?? 0) >= level;
      const current = !reached && level === (currentLevel ?? 0) + 1;
      const income = (quote?.[2] ?? 0n) + (quote?.[3] ?? 0n);
      return <div className={`single-step ${reached ? "reached" : current ? "current" : ""}`} key={level}>
        <span className="single-node">{reached ? <Check size={15}/> : level}</span>
        <div className="single-copy"><div><small>LEVEL {level}</small><b>{reached ? "Completed" : current ? "Next milestone" : "Locked"}</b></div><p>{members} team · {directNeed} direct {directNeed === 1 ? "referral" : "referrals"}</p></div>
        <div className="single-numbers"><small>YOUR PROGRESS</small><b>{Math.min(teamValue, members)}/{members} team · {Math.min(directValue, directNeed)}/{directNeed} direct</b></div>
        <div className="single-income"><small>LEVEL INCOME</small><b>{formatToken(income)} USDT</b></div>
      </div>;
    })}</div>
    <p className="tree-disclaimer">A Single-Leg level completes only when both the team and direct-referral requirements are met. Income excludes the separately credited first and second uplines.</p>
  </div>;
}

function MatrixTree({ address, parent }: { address?: Address; parent?: Address }) {
  const { tree, loading, filled, failed } = useMatrixTree(address);
  if (!address) return <div className="empty">Connect a wallet to see your position in the matrix.</div>;
  const root: MatrixNode = tree ?? { address, children: [null, null] };
  return <div className="tree-wrap">
    <div className="tree-meta"><span>{loading ? "Reading the matrix…" : configured ? `${filled} of 14 visible positions filled` : "Awaiting deployment"}</span><span className="tree-legend"><i className="slot-key you"/>You<i className="slot-key member"/>Member<i className="slot-key open"/>Open</span></div>
    <div className="tree-progress" aria-label={`${filled} of 14 visible matrix positions filled`}><span style={{ width: `${filled / 14 * 100}%` }}/></div>
    {failed > 0 && <p className="tree-warning">{failed} on-chain {failed === 1 ? "read" : "reads"} could not be completed. Successful branches remain visible and failed reads retry automatically.</p>}
    <div className="tree">
      <div className="tnode parent"><div className="slot ghost"><small>Matrix parent</small><b>{parent === undefined ? "—" : parent === zeroAddress ? "Genesis" : shortAddress(parent)}</b></div></div>
      <TreeNode node={root} depth={0} self={address}/>
    </div>
    <div className="mobile-tree">
      <div className="mobile-parent"><span>Matrix parent</span><b>{parent === undefined ? "—" : parent === zeroAddress ? "Genesis" : shortAddress(parent)}</b></div>
      {[0, 1, 2, 3].map((depth) => <div className="mobile-level" key={depth}><div className="mobile-level-head"><span>{depth === 0 ? "YOU" : `LEVEL ${depth}`}</span><small>{depth === 0 ? "Your position" : `${2 ** depth} positions`}</small></div><div className="mobile-level-nodes">{matrixLevel(root, depth).map((node, index) => <div className={`mobile-node ${depth === 0 ? "you" : node ? "member" : "open"}`} key={index}><span>{node ? node.id ? `Member ${node.id}` : depth === 0 ? "You" : "Member" : "Open"}</span><b>{node ? shortAddress(node.address) : `Position ${index + 1}`}</b></div>)}</div></div>)}
    </div>
  </div>;
}

function matrixLevel(root: MatrixNode, depth: number): (MatrixNode | null)[] {
  let level: (MatrixNode | null)[] = [root];
  for (let current = 0; current < depth; current += 1) level = level.flatMap((node) => node ? node.children : [null, null]);
  return level;
}

function TreeNode({ node, depth, self }: { node: MatrixNode | null; depth: number; self: Address }) {
  const leaf = depth >= 3;
  return <div className="tnode">
    {node ? <div className={`slot ${node.address.toLowerCase() === self.toLowerCase() ? "you" : "member"}`}><small>{node.address.toLowerCase() === self.toLowerCase() ? "You" : node.id ? `No. ${node.id.toString()}` : "Member"}</small><b>{shortAddress(node.address)}</b></div> : <div className="slot open"><small>Open</small><b>Level {depth}</b></div>}
    {!leaf && <div className="kids"><TreeNode node={node?.children[0] ?? null} depth={depth + 1} self={self}/><TreeNode node={node?.children[1] ?? null} depth={depth + 1} self={self}/></div>}
  </div>;
}

function Mechanics() { return <motion.div {...fade}>
    <section className="page-hero"><div className="wrap center"><p className="eyebrow">Mechanics</p><h1>Facts.<br/><span className="grad">Kept apart from claims.</span></h1><p className="sub">Only rules that reconcile with the source document are executable. Everything else waits for written clarification.</p></div></section>
    <section className="band gray">
      <div className="wrap-wide bento three">{[
        ["A single $25 ticket.", "The source document defines one USDT ticket, settled on BNB Smart Chain."],
        ["Allocation to the dollar.", "$15 to the working pool, $9 to the non-working pool, $1 to the five-star club. Enforced on every ticket."],
        ["Sponsorship, written once.", "A wallet registers once, against an existing sponsor. The record never changes."],
        ["No one holds the keys.", "The implemented core has no owner, no upgrade path, no pause switch and no rescue authority."],
        ["A reward engine for testnet.", "Matrix income, uplines, levels, ranks, re-entry, weekly rewards and claims run on documented prototype assumptions."],
        ["Verification for anyone.", "Events, balances, recipients and accounting totals stay queryable by anyone, at any time."],
      ].map(([t, b], i) => <div className="tile" key={t}><small className="label">{String(i + 1).padStart(2, "0")}</small><h3>{t}</h3><p>{b}</p></div>)}</div>
      <div className="wrap-wide"><div className="tile tile-dark notice-tile"><h3>For testnet validation only.</h3><p>This build guarantees no returns and is not ready for mainnet. Unresolved financial rules need written clarification, followed by independent security and legal review.</p></div></div>
    </section>
  </motion.div>;
}
