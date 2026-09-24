import "dotenv/config";
import blessed from "blessed";
import {
  Keypair,
  Contract,
  Account,
  TransactionBuilder,
  BASE_FEE,
  Address,
  scValToNative,
  rpc,
} from "@stellar/stellar-sdk";
import {
  IdentityClient,
  CommerceClient,
  TESTNET,
  type MarcConfig,
  type Job,
} from "marc-stellar-sdk";
import { retryWithBackoff } from "../shared.js";
import { watchFile, unwatchFile, readFileSync, existsSync } from "node:fs";

const DEFAULT_JOB_BUDGET = 10_000_000n;

function parseCliArgs(args: string[]) {
  const values = {
    budget: DEFAULT_JOB_BUDGET,
    provider: undefined as string | undefined,
    description: undefined as string | undefined,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--budget") {
      values.budget = BigInt(args[i + 1] ?? String(DEFAULT_JOB_BUDGET));
      i += 1;
    } else if (arg === "--provider") {
      values.provider = args[i + 1];
      i += 1;
    } else if (arg === "--description") {
      values.description = args[i + 1];
      i += 1;
    }
  }
  return values;
}

const cliArgs = parseCliArgs(process.argv.slice(2));

const cfg: MarcConfig = {
  rpcUrl: process.env.STELLAR_RPC_URL ?? TESTNET.rpcUrl,
  networkPassphrase: process.env.STELLAR_NETWORK_PASSPHRASE ?? TESTNET.networkPassphrase,
  identityContract: process.env.AGENT_IDENTITY_CONTRACT || TESTNET.identityContract,
  commerceContract: process.env.AGENTIC_COMMERCE_CONTRACT || TESTNET.commerceContract,
  usdcToken: process.env.USDC_TOKEN_CONTRACT || TESTNET.usdcToken,
  onTx: (hash) =>
    log(
      `{gray-fg}tx: ${hash.slice(0, 16)}... → https://stellar.expert/explorer/testnet/tx/${hash}{/gray-fg}`,
    ),
};

async function getUsdc(pubkey: string): Promise<string> {
  try {
    const server = new rpc.Server(cfg.rpcUrl, { allowHttp: false });
    const op = new Contract(cfg.usdcToken).call("balance", new Address(pubkey).toScVal());
    const dummy = new Account(Keypair.random().publicKey(), "0");
    const tx = new TransactionBuilder(dummy, {
      fee: BASE_FEE,
      networkPassphrase: cfg.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();
    const sim = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) return "?.??";
    const val = BigInt(
      scValToNative((sim as rpc.Api.SimulateTransactionSuccessResponse).result!.retval),
    );
    return `${val / 10_000_000n}.${(val % 10_000_000n).toString().padStart(7, "0").slice(0, 2)}`;
  } catch {
    return "?.??";
  }
}

// ── TUI ───────────────────────────────────────────────────────────────────────

const buyer = Keypair.fromSecret(process.env.BUYER_SECRET!);
const REGISTRY = "http://localhost:4500/agents";
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120; // 10 minutes

const screen = blessed.screen({ smartCSR: true, title: "MARC Buyer Agent" });

const header = blessed.box({
  top: 0,
  left: 0,
  width: "100%",
  height: 3,
  tags: true,
  content: `{center}{bold}{cyan-fg}MARC Buyer Agent{/cyan-fg}{/bold} — {gray-fg}${buyer.publicKey().slice(0, 20)}...{/gray-fg}{/center}`,
});

const balanceBar = blessed.box({
  top: 3,
  left: 0,
  width: "100%",
  height: 3,
  tags: true,
  border: { type: "line" },
  style: { border: { fg: "gray" } },
  content: "{gray-fg}Loading balances...{/gray-fg}",
});

async function refreshBalances() {
  const buyerUsdc = await getUsdc(buyer.publicKey());
  balanceBar.setContent(
    `  {cyan-fg}Buyer{/cyan-fg} {bold}${buyerUsdc} USDC{/bold}   {gray-fg}|{/gray-fg}   {gray-fg}Dashboard → http://localhost:3000/app{/gray-fg}`,
  );
  screen.render();
}

const agentsBox = blessed.box({
  top: 6,
  left: 0,
  width: "40%",
  height: "55%",
  label: " Available Agents ",
  border: { type: "line" },
  tags: true,
  style: { border: { fg: "cyan" } },
  content: "{gray-fg}Loading...{/gray-fg}",
});

const detailBox = blessed.box({
  top: 6,
  left: "40%",
  width: "60%",
  height: "55%",
  label: " Agent Details ",
  border: { type: "line" },
  tags: true,
  style: { border: { fg: "yellow" } },
  content: "{gray-fg}Select an agent to see details{/gray-fg}",
});

const taskBox = blessed.textarea({
  top: "61%",
  left: 0,
  width: "100%",
  height: 5,
  label: " Your Task (type here, Enter to submit) ",
  border: { type: "line" },
  tags: true,
  inputOnFocus: true,
  style: { border: { fg: "green" }, focus: { border: { fg: "white" } } },
});

const logBox = blessed.log({
  top: "61%",
  left: 0,
  width: "60%",
  height: "39%",
  label: " Buyer Activity ",
  border: { type: "line" },
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  style: { border: { fg: "magenta" } },
  hidden: true,
});

const sellerLogBox = blessed.log({
  top: "61%",
  left: "60%",
  width: "40%",
  height: "39%",
  label: " Seller Activity ",
  border: { type: "line" },
  tags: true,
  scrollable: true,
  alwaysScroll: true,
  style: { border: { fg: "cyan" } },
  hidden: true,
});

screen.append(header);
screen.append(balanceBar);
screen.append(agentsBox);
screen.append(detailBox);
screen.append(taskBox);
screen.append(logBox);
screen.append(sellerLogBox);

// Recalculate layout when the terminal window is resized so boxes and logs
// do not overlap or become distorted.
screen.on("resize", () => {
  header.emit("attach");
  balanceBar.emit("attach");
  agentsBox.emit("attach");
  detailBox.emit("attach");
  taskBox.emit("attach");
  logBox.emit("attach");
  sellerLogBox.emit("attach");
  screen.render();
});

screen.key(["C-c"], () => process.exit(0));
screen.key(["n"], () => {
  logBox.hide();
  sellerLogBox.hide();
  taskBox.show();
  taskBox.setValue("");
  agentsBox.focus();
  screen.render();
});

function log(msg: string) {
  const ts = new Date().toTimeString().slice(0, 8);
  logBox.log(`{gray-fg}[${ts}]{/gray-fg} ${msg}`);
  screen.render();
}

// ── Load agents ───────────────────────────────────────────────────────────────

let agents: any[] = [];
let selectedIndex = 0;
let currentSellerLog: string | null = null;

function watchSellerLog(picked: any) {
  if (currentSellerLog) {
    unwatchFile(currentSellerLog);
  }
  const sellerLog = `../agents/${picked.id}/seller.log`;
  currentSellerLog = sellerLog;
  let lastSize = 0;
  watchFile(sellerLog, { interval: 1000 }, () => {
    if (!existsSync(sellerLog)) return;
    const content = readFileSync(sellerLog, "utf8");
    const newContent = content.slice(lastSize);
    lastSize = content.length;
    newContent
      .split("\n")
      .filter(Boolean)
      .forEach((line) => sellerLogBox.log(line));
    screen.render();
  });
}

async function loadAgents() {
  try {
    agents = await fetch(REGISTRY).then((r) => r.json());
    renderAgents();
  } catch {
    agentsBox.setContent("{red-fg}Registry not running — start agents/registry first{/red-fg}");
    screen.render();
  }
}

function renderAgents() {
  agentsBox.setContent(
    agents
      .map((a, i) =>
        i === selectedIndex
          ? `{white-bg}{black-fg} ▶ ${a.name} {/black-fg}{/white-bg}`
          : `   {cyan-fg}${a.name}{/cyan-fg}`,
      )
      .join("\n"),
  );
  if (agents[selectedIndex]) {
    const a = agents[selectedIndex];
    detailBox.setContent(
      `{bold}{cyan-fg}${a.name}{/cyan-fg}{/bold}\n\n` +
        `{yellow-fg}What it does:{/yellow-fg}\n${a.description}\n\n` +
        `{yellow-fg}Tasks:{/yellow-fg}\n${a.tasks.map((t: string) => `  • ${t}`).join("\n")}\n\n` +
        `{yellow-fg}Input:{/yellow-fg}\n${a.input}\n\n` +
        `{yellow-fg}Output:{/yellow-fg}\n${a.output}\n\n` +
        `{yellow-fg}Price:{/yellow-fg} {green-fg}${a.price_usdc} USDC{/green-fg}\n` +
        `{yellow-fg}Wallet:{/yellow-fg} {gray-fg}${a.wallet?.slice(0, 20)}...{/gray-fg}`,
    );
  }
  screen.render();
}

screen.key(["up", "k"], () => {
  if (taskBox.hidden) return; // only navigate when task box visible
  selectedIndex = Math.max(0, selectedIndex - 1);
  renderAgents();
});
screen.key(["down", "j"], () => {
  if (taskBox.hidden) return;
  selectedIndex = Math.min(agents.length - 1, selectedIndex + 1);
  renderAgents();
});

// Arrow keys on agentsBox directly
agentsBox.key(["up"], () => {
  selectedIndex = Math.max(0, selectedIndex - 1);
  renderAgents();
});
agentsBox.key(["down"], () => {
  selectedIndex = Math.min(agents.length - 1, selectedIndex + 1);
  renderAgents();
});
agentsBox.key(["enter", "tab"

/* … truncated 5359 chars — edit only what you need near the top … */
