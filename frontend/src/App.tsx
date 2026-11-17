import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Check, ChevronRight, Copy, ExternalLink } from "lucide-react";
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

  const nav = [
    ["overview", "Overview"], ["participate", "Participate"], ["referrals", "Network"], ["mechanics", "Mechanics"],
  ] as const;

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
          registered={Boolean(participant && participant.id > 0n)}
          refresh={() => { reads.refetch(); participantRead.refetch(); }}
        />}
        {view === "referrals" && <Referrals key="referrals" address={address} participant={participant}/>}
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
    <section className="hero">
      <div className="wrap center">
        <p className="eyebrow">Open Protocol</p>
        <h1>Every dollar.<br/><span className="grad">Accounted for.</span></h1>
        <p className="sub">A single $25 ticket. Three fixed pools. One contract no one can alter.</p>
        <div className="links"><button className="textlink" onClick={onParticipate}>Participate <ChevronRight size={18}/></button><button className="textlink" onClick={onMechanics}>Read the mechanics <ChevronRight size={18}/></button></div>
      </div>
      <div className="stage"><Receipt/></div>
    </section>

    <section className="stats">
      <div className="wrap stats-grid">
        <div><b>{memberCount?.toLocaleString() ?? "—"}</b><span>Members registered</span></div>
        <div><b>{total === undefined ? "—" : formatToken(total)}</b><span>USDT participated</span></div>
        <div><b>{ticket === undefined ? "25" : formatToken(ticket)}</b><span>USDT per ticket</span></div>
        <div><b>{invariant === undefined ? "—" : invariant ? "Yes" : "No"}</b><span>Ledger reconciled</span></div>
      </div>
      {!configured && <p className="wrap center muted small">Live figures appear once the contract is deployed.</p>}
    </section>

    <section className="band gray" id="allocation">
      <div className="wrap center">
        <h2>Where the money goes.</h2>
        <p className="sub">Three allocations, fixed when the contract was deployed and enforced on every ticket since. No treasury decides. No operator routes. Nothing happens off-chain.</p>
      </div>
      <div className="wrap-wide bento">
        <div className="tile tile-wide">
          <h3>One ticket. Three destinations.</h3>
          <div className="bar">{allocation.map(a => <i key={a.name} className={a.tone} style={{ flex: a.value }}/>)}</div>
          <div className="bar-legend">{allocation.map(a => <span key={a.name}><i className={`dot ${a.tone}`}/>{a.name} <b>${a.value}</b></span>)}</div>
        </div>
        {allocation.map(a => <div className={`tile tint-${a.tone}`} key={a.name}><i className={`dot big ${a.tone}`}/><b className="tile-num">${a.value}</b><h3>{a.name}</h3><p>{a.note}</p><small>{a.value / 25 * 100}% of each ticket</small></div>)}
        <div className="tile tile-dark tile-wide glow">
          <h3>On the ledger.</h3>
          <dl>
            <div><dt>Network</dt><dd>BNB Smart Chain {requiredChainId === 56 ? "mainnet" : "testnet"}</dd></div>
            <div><dt>Settlement</dt><dd>USDT, BEP-20</dd></div>
            <div><dt>Ticket</dt><dd>25.00 USDT</dd></div>
            <div><dt>Split</dt><dd>15 + 9 + 1</dd></div>
            <div><dt>Contract</dt><dd>{protocolAddress ? <a href={`${explorerUrl}/address/${protocolAddress}`} target="_blank" rel="noreferrer" className="mono">{shortAddress(protocolAddress)} <ExternalLink size={12}/></a> : "Awaiting deployment"}</dd></div>
            <div><dt>Reads</dt><dd>Refreshed every 12 seconds</dd></div>
          </dl>
        </div>
      </div>
    </section>

    <section className="band black">
      <div className="wrap center">
        <h2>Two confirmations.<br/><span className="grad-cool">That's the whole process.</span></h2>
        <p className="sub">The contract does the rest, in the order it says it will.</p>
      </div>
      <div className="wrap-wide steps">
        {[["Connect a wallet.", "Any wallet that supports BNB Smart Chain. Set it to the testnet before you begin."], ["Name a sponsor.", "The address of one existing member. The link is recorded once and cannot be edited afterwards."], ["Approve, then register.", "Grant an allowance of exactly 25 USDT and confirm. The three-way split executes in the same transaction."]].map(([t, b], i) => <div className="tile tile-dark" key={t}><span className="step-n">{i + 1}</span><h3>{t}</h3><p>{b}</p></div>)}
      </div>
    </section>

    <section className="band gradient">
      <div className="wrap center">
        <h2>Read the contract.<br/>Then decide.</h2>
        <p className="sub">This is a testnet build for validation. It promises no returns, and the reward rules it runs on are prototypes that still require an independent audit.</p>
        <div className="links"><button className="pill light" onClick={onParticipate}>Participate</button><button className="textlink light" onClick={onMechanics}>See the documented mechanics <ChevronRight size={18}/></button></div>
      </div>
    </section>
  </motion.div>;
}

function Receipt() {
  return <div className="receipt">
    <div className="receipt-head"><span>Participation receipt</span><span>Preview</span></div>
    <div className="receipt-total"><b>$25</b><small>USDT on BNB Smart Chain</small></div>
    <ul>{allocation.map(a => <li key={a.name}><i className={`dot ${a.tone}`}/><span>{a.name}</span><b>${a.value}.00</b></li>)}</ul>
    <div className="receipt-foot"><span>Settled by contract</span><b>$25.00</b></div>
  </div>;
}

function Participate({ address, currentChain, token, ticket, registered, refresh }: { address?: Address; currentChain: number; token?: Address; ticket?: bigint; registered: boolean; refresh: () => void }) {
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
  useEffect(() => { if (registerReceipt.isSuccess) refresh(); }, [registerReceipt.isSuccess, refresh]);
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

  return <motion.div {...fade}>
    <section className="page-hero"><div className="wrap center"><p className="eyebrow">Participate</p><h1>Two confirmations.<br/><span className="grad">Nothing else.</span></h1><p className="sub">Approve the allowance, then register. Your funds remain with the contract until rewards are claimed.</p></div></section>
    <section className="band gray">
      <div className="wrap-wide two-col">
        <div className="tile form">
          {showTestFaucet && <div className="test-funds">
            <div><small>BSC TESTNET FAUCET</small><b>Get test USDT first</b><span>Mint 1,000 MockUSDT directly to your connected wallet. These testing tokens have no real value.</span></div>
            <div className="test-funds-actions">
              <button className="pill" disabled={!canUseTestFundsButton} onClick={handleTestFunds}>{mintButtonLabel}</button>
              {address && <button className="token-link" disabled={assetStatus === "adding"} onClick={addTokenToWallet}>{assetStatus === "adding" ? "Opening wallet…" : assetStatus === "added" ? "USDT added to wallet" : "Add USDT to wallet"}</button>}
              <a href="https://www.bnbchain.org/en/testnet-faucet" target="_blank" rel="noreferrer">Get test BNB for gas <ExternalLink size={11}/></a>
            </div>
            {address && currentChain === 97 && needsTestBnb && <p className="test-funds-warning">Minting is an on-chain transaction. Click the button to get test BNB for gas, then mint again.</p>}
            <div className="test-token-details">
              <span>MockUSDT contract</span>
              <a href={`${explorerUrl}/token/${testTokenAddress}`} target="_blank" rel="noreferrer">{testTokenAddress} <ExternalLink size={11}/></a>
              {assetStatus === "unsupported" && <small>Your wallet could not add it automatically. Import this contract address manually as a custom token with 6 decimals.</small>}
            </div>
          </div>}
          <div className="form-step"><span className="step-n">1</span><div><h3>Sponsor.</h3><p>The address of an existing member. This relationship is permanent.</p></div></div>
          <label>Sponsor wallet address<input value={sponsor} onChange={e => setSponsor(e.target.value.trim())} placeholder="0x…" spellCheck={false}/></label>
          {!refFromUrl && genesisSponsor && sponsor.toLowerCase() === genesisSponsor.toLowerCase() && <p className="default-sponsor">Using the verified genesis sponsor for this testnet deployment.</p>}
          <p className={`hint ${validSponsor ? "ok" : ""}`}>{validSponsor && <Check size={14}/>} {sponsorMessage}</p>
          <hr/>
          <div className="form-step"><span className="step-n">2</span><div><h3>Allowance.</h3><p>Exactly {formatToken(effectiveTicket) === "—" ? "25" : formatToken(effectiveTicket)} USDT. Not a cent more.</p></div></div>
          <ul className="summary"><li><span>Working pool</span><b>15.00</b></li><li><span>Non-working pool</span><b>9.00</b></li><li><span>Five-star club</span><b>1.00</b></li><li className="total"><span>Total, USDT</span><b>25.00</b></li>{address && <li className={hasBalance ? "wallet-balance ok" : "wallet-balance low"}><span>Your wallet balance</span><b>{formatToken(displayedBalance)} USDT</b></li>}</ul>
          {!address ? <div className="empty">Connect a wallet to continue.</div> : registered ? <div className="done"><Check size={18}/><div><b>You're already registered.</b><span>This wallet holds a place in the sponsor graph.</span></div></div> : <div className="stack">
            {!approved && <button className="pill wide" disabled={!protocolAddress || !paymentToken || !effectiveTicket || !hasBalance || busy || currentChain !== requiredChainId} onClick={() => approve.writeContract({ address: paymentToken!, abi: erc20Abi, functionName: "approve", args: [protocolAddress!, effectiveTicket!], chainId: requiredChainId })}>{approveReceipt.isLoading ? "Confirming approval…" : currentChain !== requiredChainId ? "Switch to BSC Testnet first" : hasBalance ? "Approve 25 USDT" : "Get test USDT first"}</button>}
            <div className="registration-action">
              <small>FINAL STEP · REGISTRATION</small>
              <button className="pill wide register-button" disabled={!protocolAddress || !approved || !hasBalance || !validSponsor || busy || currentChain !== requiredChainId} onClick={() => register.writeContract({ address: protocolAddress!, abi: protocolAbi, functionName: "register", args: [sponsor as Address], chainId: requiredChainId })}>{registerReceipt.isLoading ? "Registering wallet on-chain…" : currentChain !== requiredChainId ? "Register wallet — switch to BSC Testnet" : !hasBalance ? "Register wallet — get test USDT first" : !validSponsor ? "Register wallet — valid sponsor required" : approved ? "Register wallet" : "Register wallet — approve USDT first"}</button>
            </div>
          </div>}
          {transactionError && <p className="error">{transactionError}</p>}
          {mintReceipt.isSuccess && address && displayedBalance !== undefined && <p className="mint-confirmed"><Check size={14}/> Mint confirmed for {shortAddress(address)}. On-chain balance: {formatToken(displayedBalance)} USDT.</p>}
          {mintReceipt.data && <a className="textlink" href={`${explorerUrl}/tx/${mintReceipt.data.transactionHash}`} target="_blank" rel="noreferrer">View the mint transaction <ExternalLink size={14}/></a>}
          {registerReceipt.data && <a className="textlink" href={`${explorerUrl}/tx/${registerReceipt.data.transactionHash}`} target="_blank" rel="noreferrer">View the confirmed transaction <ExternalLink size={14}/></a>}
        </div>
        <div className="side">
          <div className="tile"><small className="label">Your wallet</small><b className="tile-num mono">{shortAddress(address)}</b><p>Your ticket funds the contract-held pools and the reward accounting that sits behind them.</p></div>
          <div className="tile"><small className="label">Conservation</small><b className="tile-num">15 + 9 + 1 = 25</b><p>If any recipient would receive less than its exact share, the registration reverts in full. Nothing partial ever settles.</p></div>
          <div className="tile tile-dark"><small className="label">Testnet assumptions apply</small><p>Matrix placement, ranks, rewards and withdrawals run on documented prototype assumptions. They need an independent audit before any production use.</p></div>
        </div>
      </div>
    </section>
  </motion.div>;
}

function Referrals({ address, participant }: { address?: Address; participant?: { id: bigint; directCount: bigint; sponsor: Address; joinedAt: bigint } }) {
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
  const singleLeg = rewards.data?.[9]?.result as number | undefined;
  const link = address ? `${location.origin}${location.pathname}?ref=${address}` : "Connect a wallet to create your link";
  const joined = participant?.joinedAt ? new Date(Number(participant.joinedAt) * 1000).toLocaleDateString() : "—";
  const [copied, setCopied] = useState(false);
  const [networkView, setNetworkView] = useState<"matrix" | "working" | "single">("matrix");
  const copy = () => { navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  return <motion.div {...fade}>
    <section className="page-hero"><div className="wrap center"><p className="eyebrow">Network</p><h1>Your place.<br/><span className="grad">On the record.</span></h1><p className="sub">Sponsorship is permanent. Placement follows the global breadth-first matrix, never anyone's discretion.</p></div></section>
    <section className="band gray">
      <div className="wrap-wide bento">
        <div className="tile tile-wide">
          <small className="label">Your invitation</small>
          <div className="copy-row"><code>{link}</code><button disabled={!address} onClick={copy} aria-label="Copy link">{copied ? <Check size={16}/> : <Copy size={16}/>}</button></div>
          <p>Anyone who follows this link will have your wallet entered as their sponsor. It promises neither placement nor income.</p>
        </div>
        <div className="tile"><small className="label">Member</small><b className="tile-num">{participant?.id ? `No. ${participant.id.toString()}` : "—"}</b><p>{participant?.id ? `Joined ${joined}` : "Not registered"}</p></div>
        <div className="tile"><small className="label">Direct referrals</small><b className="tile-num">{participant?.directCount?.toString() ?? "—"}</b><p>Members who named you as sponsor.</p></div>
        <div className="tile"><small className="label">Sponsor</small><b className="tile-num mono">{!participant?.id ? "—" : participant.sponsor === zeroAddress ? "Genesis" : shortAddress(participant.sponsor)}</b><p>Recorded once. Never changes.</p></div>
        <div className="tile tile-dark tile-wide rewards">
          <div className="rewards-grid">
            <div><small className="label">Claimable</small><b className="tile-num">{formatToken(withdrawable)} <em>USDT</em></b></div>
            <div><small className="label">Awaiting settlement</small><b className="tile-num">{formatToken(queued)} <em>USDT</em></b></div>
            <div><small className="label">Team</small><b className="tile-num">{team?.toString() ?? "—"}</b></div>
            <div><small className="label">Levels</small><b className="tile-num">{working ?? "—"} <em>/</em> {nonWorking ?? "—"}</b></div>
            <div><small className="label">Star rank</small><b className="tile-num">{rank ?? "—"}</b></div>
            <div><small className="label">Matrix parent</small><b className="tile-num mono">{placement === zeroAddress ? "Genesis" : shortAddress(placement)}</b></div>
          </div>
          <div className="stack row">
            <button className="pill ghost" disabled={!address || queued === 0n || settle.isPending || settleReceipt.isLoading} onClick={() => settle.writeContract({ address: protocolAddress!, abi: protocolAbi, functionName: "settlePoolRewards" })}>{settleReceipt.isLoading ? "Settling…" : "Settle pools"}</button>
            <button className="pill" disabled={!address || !withdrawable || claim.isPending || claimReceipt.isLoading} onClick={() => claim.writeContract({ address: protocolAddress!, abi: protocolAbi, functionName: "claim" })}>{claimReceipt.isLoading ? "Claiming…" : "Claim rewards"}</button>
          </div>
        </div>
        <div className="tile tile-wide matrix">
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
