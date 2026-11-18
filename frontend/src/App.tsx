import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowUpRight, Check, ChevronRight, Coins, Copy, ExternalLink, ShieldCheck, Sparkles, UserRoundCheck, WalletCards } from "lucide-react";
import { decodeFunctionResult, encodeFunctionData, isAddress, zeroAddress, type Address } from "viem";
import { useAccount, useBalance, useReadContract, useReadContracts, useSwitchChain, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { chainId as requiredChainId, deploymentError, explorerUrl, genesisSponsor, protocolAddress, testTokenAddress, walletConnectEnabled } from "./config";
import { erc20Abi, mockUsdtAbi, protocolAbi } from "./contracts/abi";
import { useUi } from "./store/ui";
import { formatToken, shortAddress } from "./utils/format";
import { useMatrixTree, type MatrixNode } from "./matrix";

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
    ? [["overview", "Overview"], ["referrals", "Dashboard"], ["mechanics", "Mechanics"]] as const
    : [["overview", "Overview"], ["participate", "Participate"], ["referrals", "Network"], ["mechanics", "Mechanics"]] as const;

  return <div className="shell">
    <header className="globalnav">
      <div className="globalnav-inner">
        <button className="wordmark" onClick={() => setView("overview")}>Open Protocol</button>
        <nav>{nav.map(([key, label]) => <button key={key} className={view === key ? "active" : ""} onClick={() => setView(key)}>{label}</button>)}</nav>
        <div className="globalnav-right"><ConnectButton accountStatus="address" chainStatus="none" showBalance={false} label="Connect"/></div>
      </div>
    </header>

    {!configured && <div className={`ribbon ${deploymentError ? "ribbon-warn" : ""}`}>{deploymentError ?? <>Interface ready. Set <code>VITE_PROTOCOL_ADDRESS</code> after deployment and live reads and transactions switch on.</>}</div>}
    {!walletConnectEnabled && !isConnected && <div className="ribbon">Connect any injected EVM wallet. On mobile, open this page inside SafePal, MetaMask, Trust Wallet, Binance Wallet, or another wallet's DApp browser.</div>}
    {isConnected && currentChain !== requiredChainId && <button className="ribbon ribbon-warn" onClick={() => switchChain({ chainId: requiredChainId })}>This wallet is on another network. Switch to BNB Smart Chain <ChevronRight size={14}/></button>}

    <main>
      <AnimatePresence mode="wait">
        {view === "overview" && <Overview key="overview" memberCount={memberCount} total={total} ticket={ticket} invariant={invariant} onParticipate={() => setView("participate")} onMechanics={() => setView("mechanics")}/>}
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

function Overview({ memberCount, total, ticket, invariant, onParticipate, onMechanics }: { memberCount?: bigint; total?: bigint; ticket?: bigint; invariant?: boolean; onParticipate: () => void; onMechanics: () => void }) {
  return <motion.div {...fade}>
    <section className="overview-hero">
      <div className="wrap-wide overview-hero-grid">
        <div className="overview-copy">
          <div className="environment-badge"><i/> BSC TESTNET · NO REAL FUNDS</div>
          <h1>Join Open Protocol<br/><span className="grad">in four clear steps.</span></h1>
          <p>Connect your wallet, receive free test tokens, confirm your sponsor, then approve and register. The dashboard opens automatically when registration succeeds.</p>
          <div className="overview-actions"><button className="pill" onClick={onParticipate}>Start registration <ChevronRight size={17}/></button><button className="overview-secondary" onClick={onMechanics}>Review contract rules</button></div>
          <div className="hero-trust"><span><Check size={13}/> 25 test USDT</span><span><Check size={13}/> Exact contract allowance</span><span><Check size={13}/> No real-value tokens</span></div>
        </div>
        <div className="start-card">
          <div className="start-card-head"><div><small>BEFORE YOU START</small><h3>What you need</h3></div><span>~3 minutes</span></div>
          <ul>
            <li><span><WalletCards size={17}/></span><div><b>A Web3 wallet</b><p>MetaMask, Trust Wallet, SafePal or another BSC-compatible wallet.</p></div><Check size={15}/></li>
            <li><span><Coins size={17}/></span><div><b>Free test BNB</b><p>A small amount is needed only for testnet transaction fees.</p></div><Check size={15}/></li>
            <li><span><UserRoundCheck size={17}/></span><div><b>A registered sponsor</b><p>Use your referral link or the verified testnet sponsor.</p></div><Check size={15}/></li>
          </ul>
          <div className="start-total"><span>Registration amount</span><b>{ticket === undefined ? "25.00" : formatToken(ticket)} USDT</b><small>Test tokens only</small></div>
        </div>
      </div>
    </section>

    <section className="overview-proof">
      <div className="wrap-wide proof-grid">
        <div><small>REGISTERED MEMBERS</small><b>{memberCount?.toLocaleString() ?? "—"}</b></div>
        <div><small>TEST USDT PROCESSED</small><b>{total === undefined ? "—" : formatToken(total)}</b></div>
        <div><small>NETWORK</small><b>BSC Testnet</b></div>
        <div><small>ACCOUNTING STATUS</small><b className={invariant ? "verified" : ""}>{invariant === undefined ? "Checking" : invariant ? "Reconciled" : "Review required"}</b></div>
      </div>
    </section>

    <section className="simple-flow">
      <div className="wrap-wide">
        <div className="overview-section-head"><small>HOW TO JOIN</small><h2>One guided registration.</h2><p>The registration page checks each requirement and shows only the next action you need to take.</p></div>
        <div className="join-flow">
          {[
            { icon: WalletCards, title: "Connect your wallet", copy: "Choose your wallet and switch to BNB Smart Chain Testnet.", tag: "No payment" },
            { icon: Coins, title: "Get free test tokens", copy: "Get test BNB for gas, then mint MockUSDT directly to your wallet.", tag: "Testnet only" },
            { icon: UserRoundCheck, title: "Confirm your sponsor", copy: "We verify the sponsor address on-chain before you can continue.", tag: "Permanent link" },
            { icon: ShieldCheck, title: "Approve and register", copy: "Approve exactly 25 USDT, then confirm registration in your wallet.", tag: "2 confirmations" },
          ].map(({ icon: Icon, title, copy, tag }, index) => <article key={title}><div className="flow-top"><span><Icon size={19}/></span><small>STEP 0{index + 1}</small></div><h3>{title}</h3><p>{copy}</p><em>{tag}</em>{index < 3 && <i><ChevronRight size={16}/></i>}</article>)}
        </div>
        <div className="flow-cta"><div><b>Ready to begin?</b><span>We will guide you through each check.</span></div><button className="pill" onClick={onParticipate}>Open registration <ArrowUpRight size={16}/></button></div>
      </div>
    </section>

    <section className="ticket-explainer" id="allocation">
      <div className="wrap-wide ticket-layout">
        <div><small>YOUR 25 USDT</small><h2>A fixed split.<br/>Nothing hidden.</h2><p>The contract divides the registration amount into three documented pools in the same transaction. If the full split cannot complete, registration reverts.</p><button className="overview-secondary" onClick={onMechanics}>See how rewards work <ChevronRight size={15}/></button></div>
        <div className="split-card"><div className="split-total"><span>REGISTRATION</span><b>25.00 <em>USDT</em></b></div><div className="split-bar">{allocation.map(a => <i key={a.name} className={a.tone} style={{ flex: a.value }}/>)}</div><ul>{allocation.map(a => <li key={a.name}><span><i className={a.tone}/>{a.name}</span><b>{a.value}.00 USDT</b></li>)}</ul><div className="split-check"><Check size={15}/> 15 + 9 + 1 always equals 25 USDT</div></div>
      </div>
    </section>

    <section className="after-join">
      <div className="wrap-wide after-join-grid">
        <div className="dashboard-preview"><div className="preview-top"><span><i/> MEMBER DASHBOARD</span><small>LIVE ON-CHAIN</small></div><div className="preview-balance"><small>AVAILABLE TO CLAIM</small><b>0.00 <em>USDT</em></b></div><div className="preview-metrics"><span><small>DIRECTS</small><b>0</b></span><span><small>TEAM</small><b>0</b></span><span><small>RANK</small><b>Member</b></span></div></div>
        <div className="after-copy"><small>AFTER REGISTRATION</small><h2>Your dashboard opens automatically.</h2><p>From one place you can copy your referral link, review all income streams, follow rank progress, see your network and claim available rewards.</p><ul><li><Check size={14}/> Membership status and wallet</li><li><Check size={14}/> Referral and team progress</li><li><Check size={14}/> Income, pool settlement and claims</li><li><Check size={14}/> Matrix and level views</li></ul><button className="pill" onClick={onParticipate}>Join on testnet <ChevronRight size={16}/></button></div>
      </div>
    </section>

    <section className="overview-disclaimer"><div className="wrap-wide"><ShieldCheck size={18}/><p><b>Testnet validation build.</b> MockUSDT has no monetary value. The protocol promises no returns and requires an independent audit before production use.</p>{protocolAddress && <a href={`${explorerUrl}/address/${protocolAddress}`} target="_blank" rel="noreferrer">View contract <ExternalLink size={12}/></a>}</div></section>
  </motion.div>;
}

function Participate({ address, currentChain, token, ticket, registered, refresh, onOpenDashboard }: { address?: Address; currentChain: number; token?: Address; ticket?: bigint; registered: boolean; refresh: () => void; onOpenDashboard: () => void }) {
  const { connector } = useAccount();
  const { switchChain } = useSwitchChain();
  const refFromUrl = new URLSearchParams(location.search).get("ref") ?? "";
  const [sponsor, setSponsor] = useState(refFromUrl || genesisSponsor || "");
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
  const mintButtonLabel = mintReceipt.isLoading
    ? "Minting…"
    : mintReceipt.isSuccess
      ? "Minted 1,000 USDT"
      : !address
        ? "Connect wallet to mint"
        : currentChain !== 97
          ? "Switch to BSC Testnet"
          : needsTestBnb
            ? "Test BNB required for gas"
          : !testTokenCompatible
              ? "Test token unavailable"
              : "Mint test USDT";
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
  const sponsorMessage = !sponsorAddressValid ? "Enter a valid address that is not your own wallet." : sponsorRead.isLoading ? "Checking this sponsor on-chain…" : validSponsor ? "Registered sponsor verified on-chain." : "This address is not a registered sponsor.";
  const onRequiredChain = currentChain === requiredChainId;
  const readiness = [
    { label: "Wallet", detail: address ? shortAddress(address) : "Connect", done: Boolean(address && onRequiredChain), icon: WalletCards },
    { label: "Test funds", detail: hasBalance ? `${formatToken(displayedBalance)} USDT` : "Required", done: hasBalance, icon: Coins },
    { label: "Sponsor", detail: validSponsor ? "Verified" : "Required", done: validSponsor, icon: UserRoundCheck },
    { label: "Approval", detail: approved ? "Confirmed" : "Required", done: approved, icon: ShieldCheck },
  ];
  const readinessCount = readiness.filter(step => step.done).length;

  return <motion.div {...fade}>
    <section className="join-hero"><div className="wrap-wide join-hero-inner"><div><div className="environment-badge"><i/> BSC TESTNET · SAFE ONBOARDING</div><h1>Become a member.</h1><p>Complete four verified checks, approve exactly 25 test USDT, and open your dashboard.</p></div><div className="join-assurance"><ShieldCheck size={18}/><div><b>Contract-controlled</b><span>No manual payment or custody</span></div></div></div></section>
    <section className="band gray join-band">
      <div className="wrap-wide">
        <div className="registration-progress" aria-label={`${readinessCount} of 4 registration checks complete`}>
          <div className="progress-heading"><div><small>REGISTRATION READINESS</small><b>{registered ? "Membership active" : `${readinessCount} of 4 checks complete`}</b></div><span>{registered ? "100" : readinessCount * 25}%</span></div>
          <div className="progress-line"><i style={{ width: `${registered ? 100 : readinessCount * 25}%` }}/></div>
          <div className="readiness-steps">{readiness.map(({ label, detail, done, icon: Icon }, index) => <div className={done ? "complete" : ""} key={label}><span>{done ? <Check size={14}/> : <Icon size={15}/>}</span><div><small>0{index + 1}</small><b>{label}</b><em>{detail}</em></div></div>)}</div>
        </div>

        <div className="registration-layout">
        <div className="tile form premium-form">
          <div className="form-section-heading"><span>01</span><div><small>SPONSOR</small><h3>Confirm your invitation</h3><p>Your sponsor is recorded permanently when registration completes.</p></div>{validSponsor && <i><Check size={15}/></i>}</div>
          <label className="premium-input"><span>Sponsor wallet address</span><input value={sponsor} onChange={e => setSponsor(e.target.value.trim())} placeholder="0x…" spellCheck={false}/></label>
          {!refFromUrl && genesisSponsor && sponsor.toLowerCase() === genesisSponsor.toLowerCase() && <p className="default-sponsor">Verified genesis sponsor selected for this testnet.</p>}
          <p className={`hint ${validSponsor ? "ok" : ""}`}>{validSponsor && <Check size={14}/>} {sponsorMessage}</p>

          <div className="form-divider"/>
          <div className="form-section-heading"><span>02</span><div><small>PARTICIPATION</small><h3>Review the 25 USDT allocation</h3><p>The split is fixed in the contract and settles atomically.</p></div></div>
          <div className="allocation-review"><div className="allocation-total"><small>TOTAL COMMITMENT</small><b>25.00 <em>USDT</em></b></div><div className="allocation-bar"><i/><i/><i/></div><div className="allocation-items"><span><i className="blue"/>Working pool <b>15</b></span><span><i className="green"/>Non-working <b>9</b></span><span><i className="purple"/>Five-star <b>1</b></span></div>{address && <div className={`balance-row ${hasBalance ? "ok" : "low"}`}><span>Available in wallet</span><b>{formatToken(displayedBalance)} USDT</b></div>}</div>

          {!address ? <div className="next-action"><div><small>NEXT ACTION</small><h4>Connect your wallet</h4><p>Use the secure wallet control to begin the readiness checks.</p></div><ConnectButton label="Connect wallet" accountStatus="address" chainStatus="none" showBalance={false}/></div> : registered ? <div className="done registered-done"><Check size={18}/><div><b>Membership is active.</b><span>Your dashboard and referral tools are ready.</span></div><button className="pill" onClick={onOpenDashboard}>Open dashboard <ArrowUpRight size={15}/></button></div> : !onRequiredChain ? <div className="next-action"><div><small>NEXT ACTION</small><h4>Switch to BSC Testnet</h4><p>Your wallet must use chain ID 97 for every registration transaction.</p></div><button className="pill" onClick={() => switchChain({ chainId: requiredChainId })}>Switch network</button></div> : !hasBalance ? <div className="next-action"><div><small>NEXT ACTION</small><h4>{needsTestBnb ? "Get test BNB for gas" : "Fund your test wallet"}</h4><p>{needsTestBnb ? "One faucet transaction needs a small amount of test BNB." : "Mint 1,000 MockUSDT. Test tokens have no monetary value."}</p></div><button className="pill" disabled={!canUseTestFundsButton} onClick={handleTestFunds}>{mintButtonLabel} <ChevronRight size={15}/></button></div> : !validSponsor ? <div className="next-action waiting"><div><small>NEXT ACTION</small><h4>Verify a sponsor</h4><p>Enter a registered address above to continue.</p></div><span>Waiting for valid address</span></div> : !approved ? <div className="next-action"><div><small>NEXT ACTION</small><h4>Approve exactly 25 USDT</h4><p>This grants the protocol a one-time registration allowance.</p></div><button className="pill" disabled={!protocolAddress || !paymentToken || !effectiveTicket || busy} onClick={() => approve.writeContract({ address: paymentToken!, abi: erc20Abi, functionName: "approve", args: [protocolAddress!, effectiveTicket!], chainId: requiredChainId })}>{approveReceipt.isLoading ? "Confirming…" : "Approve 25 USDT"} <ShieldCheck size={15}/></button></div> : <div className="next-action ready"><div><small>FINAL CONFIRMATION</small><h4>Everything is ready</h4><p>Confirm registration in your wallet. Your dashboard opens automatically.</p></div><button className="pill register-button" disabled={!protocolAddress || busy} onClick={() => register.writeContract({ address: protocolAddress!, abi: protocolAbi, functionName: "register", args: [sponsor as Address], chainId: requiredChainId })}>{registerReceipt.isLoading ? "Registering…" : "Complete registration"} <Sparkles size={15}/></button></div>}

          {showTestFaucet && address && <details className="test-assets"><summary>Testnet assets and wallet tools <ChevronRight size={14}/></summary><div><button className="token-link" disabled={assetStatus === "adding"} onClick={addTokenToWallet}>{assetStatus === "adding" ? "Opening wallet…" : assetStatus === "added" ? "USDT added to wallet" : "Add MockUSDT to wallet"}</button><a href="https://www.bnbchain.org/en/testnet-faucet" target="_blank" rel="noreferrer">Get test BNB <ExternalLink size={11}/></a><a href={`${explorerUrl}/token/${testTokenAddress}`} target="_blank" rel="noreferrer">View token contract <ExternalLink size={11}/></a></div>{assetStatus === "unsupported" && <p>Import {testTokenAddress} manually with 6 decimals.</p>}</details>}
          {transactionError && <p className="error">{transactionError}</p>}
          {mintReceipt.isSuccess && address && displayedBalance !== undefined && <p className="mint-confirmed"><Check size={14}/> Mint confirmed for {shortAddress(address)}. On-chain balance: {formatToken(displayedBalance)} USDT.</p>}
          {mintReceipt.data && <a className="textlink" href={`${explorerUrl}/tx/${mintReceipt.data.transactionHash}`} target="_blank" rel="noreferrer">View the mint transaction <ExternalLink size={14}/></a>}
          {registerReceipt.data && <a className="textlink" href={`${explorerUrl}/tx/${registerReceipt.data.transactionHash}`} target="_blank" rel="noreferrer">View the confirmed transaction <ExternalLink size={14}/></a>}
        </div>
        <aside className="registration-review">
          <div className="review-card"><small>REGISTRATION REVIEW</small><h3>Your membership</h3><dl><div><dt>Wallet</dt><dd>{shortAddress(address)}</dd></div><div><dt>Network</dt><dd><i className={onRequiredChain ? "online" : ""}/>{onRequiredChain ? "BSC Testnet" : "Wrong network"}</dd></div><div><dt>Sponsor</dt><dd>{validSponsor ? shortAddress(sponsor) : "Not verified"}</dd></div><div><dt>Approval</dt><dd>{approved ? "25 USDT approved" : "Pending"}</dd></div></dl><div className="review-total"><span>Registration total</span><b>25.00 USDT</b></div></div>
          <div className="trust-card"><ShieldCheck size={20}/><div><b>Transaction protection</b><p>The contract requires the exact 25 USDT allowance. Registration reverts completely if any rule fails.</p></div></div>
          <div className="prototype-note"><span>TESTNET PROTOTYPE</span><p>Tokens have no value. Reward mechanics require an independent audit before production use.</p></div>
        </aside>
        </div>
      </div>
    </section>
  </motion.div>;
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
  const link = address ? `${location.origin}${location.pathname}?ref=${address}` : "Connect a wallet to create your link";
  const joined = participant?.joinedAt ? new Date(Number(participant.joinedAt) * 1000).toLocaleDateString() : "—";
  const [copied, setCopied] = useState(false);
  const [networkView, setNetworkView] = useState<"matrix" | "working" | "single">("matrix");
  const copy = () => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); };
  const registered = Boolean(participant?.id);
  const directCount = Number(participant?.directCount ?? 0n);
  const teamCount = Number(team ?? 0n);
  const currentRank = rank ?? 0;
  const rankNames = ["Member", "1 Star", "2 Star", "3 Star", "4 Star", "5 Star"];
  const directRequirements = [0, 4, 8, 12, 16, 16];
  const teamRequirements = [0, 0, 16, 64, 300, 1_000];
  const nextRank = Math.min(5, currentRank + 1);
  const directProgress = directRequirements[nextRank] ? directCount / directRequirements[nextRank] * 100 : 100;
  const teamProgress = teamRequirements[nextRank] ? teamCount / teamRequirements[nextRank] * 100 : 100;
  const rankProgress = currentRank >= 5 ? 100 : Math.min(100, directProgress, teamProgress);

  return <motion.div {...fade}>
    <section className="dashboard-hero">
      <div className="wrap-wide dashboard-hero-inner">
        <div className="dashboard-identity"><div className={`member-status ${registered ? "active" : "inactive"}`}><i/><div><small>MEMBERSHIP STATUS</small><b>{registered ? "Active on BSC Testnet" : "Not registered"}</b></div></div><p className="eyebrow">Member dashboard</p><h1>{registered ? <>Welcome back, <span className="grad">Member {participant!.id.toString()}.</span></> : <>Your dashboard <span className="grad">starts here.</span></>}</h1><p className="sub">{registered ? `Joined ${joined} · ${address ? shortAddress(address) : "Wallet not connected"}` : "Connect and register your wallet to unlock live membership, rewards, referrals and progression."}</p></div>
        <div className="balance-command"><div className="balance-command-top"><span>AVAILABLE TO CLAIM</span><small>LIVE · 12S</small></div><b>{formatToken(withdrawable)} <em>USDT</em></b><p>{queued > 0n ? `${formatToken(queued)} USDT is also waiting for pool settlement.` : "Your credited rewards appear here automatically."}</p><div><button className="pill ghost" disabled={!address || queued === 0n || settle.isPending || settleReceipt.isLoading} onClick={() => settle.writeContract({ address: protocolAddress!, abi: protocolAbi, functionName: "settlePoolRewards", chainId: requiredChainId })}>{settleReceipt.isLoading ? "Settling…" : "Settle pools"}</button><button className="pill" disabled={!address || !withdrawable || claim.isPending || claimReceipt.isLoading} onClick={() => claim.writeContract({ address: protocolAddress!, abi: protocolAbi, functionName: "claim", chainId: requiredChainId })}>{claimReceipt.isLoading ? "Claiming…" : "Claim rewards"} <ArrowUpRight size={15}/></button></div></div>
      </div>
    </section>
    <section className="band gray dashboard-band">
      <div className="wrap-wide">
        {!registered && <div className="dashboard-onboarding"><div><small>ONE STEP AWAY</small><h3>Register to unlock your member dashboard.</h3><p>Your dashboard brings your membership, invite link, network progression and rewards into one place.</p></div><button className="pill" onClick={onParticipate}>Start registration <ChevronRight size={17}/></button></div>}

        <div className="dashboard-metrics" aria-label="Membership overview">
          <article className="metric-card primary"><small>Direct referrals</small><b>{registered ? directCount : "—"}</b><span>{registered ? `${Math.max(0, 4 - directCount)} until 1 Star` : "Register to invite"}</span></article>
          <article className="metric-card"><small>Total team</small><b>{registered ? teamCount : "—"}</b><span>Across your sponsor network</span></article>
          <article className="metric-card"><small>Current rank</small><b>{registered ? rankNames[currentRank] : "—"}</b><span>{currentRank >= 5 ? "Highest rank reached" : `Next: ${rankNames[nextRank]}`}</span></article>
          <article className="metric-card"><small>Pool income pending</small><b>{formatToken(queued)} <em>USDT</em></b><span>{queued > 0n ? "Ready to settle" : "No pending pool income"}</span></article>
        </div>

        <div className="dashboard-quick-grid">
          <div className="tile invite-card">
            <div className="tile-heading"><div><small className="label">Invite people</small><h3>Your personal referral link</h3></div><span className="status-chip">Permanent sponsor link</span></div>
            <div className="copy-row"><code>{link}</code><button disabled={!address || !registered} onClick={copy} aria-label="Copy referral link">{copied ? <Check size={16}/> : <Copy size={16}/>}</button></div>
            <p>Share this link only with people who understand this is a testnet prototype. Registration records you as their sponsor.</p>
          </div>
          <div className="tile rank-card">
            <div className="tile-heading"><div><small className="label">Progress</small><h3>{currentRank >= 5 ? "Top rank achieved" : `${rankNames[nextRank]} requirements`}</h3></div><b>{Math.round(rankProgress)}%</b></div>
            <div className="rank-progress"><i style={{ width: `${rankProgress}%` }}/></div>
            <div className="rank-requirements"><span><b>{directCount}</b> / {directRequirements[nextRank]} directs</span><span><b>{teamCount}</b> / {teamRequirements[nextRank]} team</span></div>
            <p>{currentRank >= 5 ? "Your five-star achievement weight continues with team growth." : "Both requirements must be reached before the contract advances your rank."}</p>
          </div>
        </div>

        <div className="tile income-panel">
          <div className="section-heading"><div><small className="label">All income</small><h3>Every reward stream in one place</h3></div><span>Live contract balances</span></div>
          <div className="income-summary">
            <div><small>Available now</small><b>{formatToken(creditedIncome)} <em>USDT</em></b><span>Credited income ready to claim</span></div>
            <div><small>Pool income queued</small><b>{formatToken(queued)} <em>USDT</em></b><span>Settle pools to make it claimable</span></div>
            <div><small>Five-Star pending</small><b>{formatToken(pendingFiveStar)} <em>USDT</em></b><span>Included in the withdrawable total</span></div>
          </div>
          <div className="income-grid">
            <IncomeCard title="Direct income" description="Rewards from eligible direct referrals."/>
            <IncomeCard title="Ten-level upline" description="Upline rewards distributed across ten levels."/>
            <IncomeCard title="Global Matrix" description="Income generated by binary matrix placement."/>
            <IncomeCard title="Non-working upline" description="U1 and eligible non-working upline rewards."/>
            <IncomeCard title="Weekly Superstar" description="Weekly rewards for qualified performers."/>
            <IncomeCard title="Re-entry income" description="Rewards created by completed pool re-entries."/>
            <IncomeCard title="Single-Leg Pool" description="Income waiting in your Single-Leg pool." value={pendingSingleLeg}/>
            <IncomeCard title="Working Pool" description="Income waiting in your Working Pool." value={pendingWorking}/>
            <IncomeCard title="Non-Working Pool" description="Income waiting in your Non-Working Pool." value={pendingNonWorking}/>
            <IncomeCard title="Five-Star Royalty" description="Your pending share of the Five-Star club." value={pendingFiveStar}/>
          </div>
          <p className="income-note">The contract stores Direct, Upline, Matrix, Superstar and Re-entry rewards together in the available balance. Exact lifetime totals for those individual categories require indexing RewardCredited events.</p>
        </div>

        <div className="tile tile-dark rewards dashboard-rewards">
          <div className="section-heading"><div><small className="label">Rewards & progression</small><h3>Your on-chain position</h3></div><span>Updates every 12 seconds</span></div>
          <div className="rewards-grid">
            <div><small className="label">Claimable</small><b className="tile-num">{formatToken(withdrawable)} <em>USDT</em></b></div>
            <div><small className="label">Awaiting settlement</small><b className="tile-num">{formatToken(queued)} <em>USDT</em></b></div>
            <div><small className="label">Team</small><b className="tile-num">{team?.toString() ?? "—"}</b></div>
            <div><small className="label">Levels</small><b className="tile-num">{working ?? "—"} <em>/</em> {nonWorking ?? "—"}</b></div>
            <div><small className="label">Star rank</small><b className="tile-num">{rank ?? "—"}</b></div>
            <div><small className="label">Matrix parent</small><b className="tile-num mono">{placement === zeroAddress ? "Genesis" : shortAddress(placement)}</b></div>
          </div>
        </div>
        <div className="tile matrix dashboard-network">
          <div className="network-intro"><small className="label">Your network, explained</small><h3>Three systems. Three different jobs.</h3><p>Choose a view to see where you are placed, how your Working Pool advances, or what your next Single-Leg milestone requires.</p></div>
          <div className="system-switcher" role="tablist" aria-label="Network system">
            <button className={networkView === "matrix" ? "active" : ""} onClick={() => setNetworkView("matrix")}><small>01</small><b>Global Matrix</b><span>Where you are placed</span></button>
            <button className={networkView === "working" ? "active" : ""} onClick={() => setNetworkView("working")}><small>02</small><b>Working Pool</b><span>Levels from team growth</span></button>
            <button className={networkView === "single" ? "active" : ""} onClick={() => setNetworkView("single")}><small>03</small><b>Single Leg</b><span>Team + direct milestones</span></button>
          </div>
          {networkView === "matrix" && <><div className="view-heading"><div><small>GLOBAL MATRIX</small><h4>Your placement tree</h4></div><p>Everyone enters one shared binary queue. Each member can have two children. Your sponsor and your matrix parent can be different.</p></div><div className="logic-strip"><div><b>1</b><span>Register</span><small>A new member joins</small></div><i/><div><b>2</b><span>Queue placement</span><small>Next open position</small></div><i/><div><b>3</b><span>Two per parent</span><small>Then the queue moves on</small></div></div><MatrixTree address={address} parent={placement}/></>}
          {networkView === "working" && <WorkingTree address={address} team={team} currentLevel={working}/>}
          {networkView === "single" && <SingleLegTree address={address} team={team} directs={participant?.directCount} currentLevel={singleLeg}/>}
        </div>
      </div>
    </section>
  </motion.div>;
}

function IncomeCard({ title, description, value }: { title: string; description: string; value?: bigint }) {
  const exact = value !== undefined;
  return <article className="income-card">
    <div><small>{exact ? "LIVE BALANCE" : "CREDITED"}</small><span className={exact ? "income-live" : "income-aggregate"}>{exact ? "Tracked separately" : "Combined balance"}</span></div>
    <h4>{title}</h4>
    <b>{exact ? <>{formatToken(value)} <em>USDT</em></> : <>Included <em>IN AVAILABLE</em></>}</b>
    <p>{description}</p>
  </article>;
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
