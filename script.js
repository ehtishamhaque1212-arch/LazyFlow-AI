/* Browser-local persistence helpers. */
const Store = (() => {
  const KEYS = { tasks: "lazyflow_tasks_v1", history: "lazyflow_history_v1", settings: "lazyflow_settings_v1", theme: "lazyflow_theme_v1" };
  const read = (key, fallback) => {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
    catch (error) { console.warn("Could not read local storage:", error); return fallback; }
  };
  const write = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { console.warn("Could not write local storage:", error); return false; }
  };
  return {
    getTasks: () => read(KEYS.tasks, []), setTasks: value => write(KEYS.tasks, value),
    getHistory: () => read(KEYS.history, []), setHistory: value => write(KEYS.history, value),
    getSettings: () => read(KEYS.settings, { url: "http://localhost:11434", model: "gemma3:1b" }),
    setSettings: value => write(KEYS.settings, value),
    getTheme: () => read(KEYS.theme, "dark"), setTheme: value => write(KEYS.theme, value)
  };
})();
/* Local Ollama API client. No hosted AI service or API key is used. */
const LocalAI = (() => {
  const getSettings = () => Store.getSettings();
  function endpoint(path) {
    const base = getSettings().url.trim().replace(/\/+$/, "");
    return `${base}${path}`;
  }
  async function request(path, options = {}, timeoutMs = 120000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint(path), { ...options, signal: controller.signal });
      if (!response.ok) {
        let detail = "";
        try { detail = (await response.json()).error || ""; } catch (_) {}
        throw new Error(detail || `Ollama returned HTTP ${response.status}.`);
      }
      return await response.json();
    } catch (error) {
      if (error.name === "AbortError") throw new Error("The request took too long. Try a smaller prompt or a lighter model.");
      if (error instanceof TypeError) throw new Error("Could not reach Ollama. Make sure Ollama is running at the configured address and browser access is allowed.");
      throw error;
    } finally { clearTimeout(timer); }
  }
  async function check() {
    const data = await request("/api/tags", {}, 10000);
    const models = Array.isArray(data.models) ? data.models : [];
    return { ok: true, models: models.map(item => item.name), configuredModel: getSettings().model };
  }
  async function generate(prompt, options = {}) {
    const settings = getSettings();
    if (!prompt.trim()) throw new Error("Add some text first.");
    const data = await request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: settings.model,
        stream: false,
        messages: [
          { role: "system", content: "You are LazyFlow, a helpful, practical, privacy-conscious productivity assistant. Be clear, accurate, warm, and concise. Do not claim to have performed actions outside this chat. If information is missing, say so." },
          { role: "user", content: prompt }
        ],
        options: { temperature: options.temperature ?? 0.6 }
      })
    }, options.timeoutMs || 180000);
    const result = data?.message?.content?.trim();
    if (!result) throw new Error("The model returned an empty response. Check the model and try again.");
    return result;
  }
  return { check, generate, getSettings };
})();
const TaskManager = (() => {
  let tasks = Store.getTasks();
  let filter = "all";
  const $ = id => document.getElementById(id);
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  function persist() { Store.setTasks(tasks); render(); }
  function add(text, priority = "normal") {
    const clean = String(text || "").trim();
    if (!clean) return false;
    tasks.unshift({ id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`), text: clean, priority, done: false, createdAt: Date.now() });
    persist(); return true;
  }
  function toggle(id) { tasks = tasks.map(task => task.id === id ? { ...task, done: !task.done } : task); persist(); }
  function remove(id) { tasks = tasks.filter(task => task.id !== id); persist(); }
  function clearCompleted() { tasks = tasks.filter(task => !task.done); persist(); }
  function render() {
    const all = tasks.length, completed = tasks.filter(t => t.done).length, active = all - completed;
    $("taskNavCount").textContent = active;
    $("allCount").textContent = all; $("activeCount").textContent = active; $("completedCount").textContent = completed;
    $("taskProgress").style.width = `${all ? completed / all * 100 : 0}%`;
    const visible = tasks.filter(t => filter === "all" || (filter === "active" && !t.done) || (filter === "completed" && t.done));
    $("taskList").innerHTML = visible.length ? visible.map(task => `<div class="task-row ${task.done ? "done" : ""}"><button class="task-check ${task.done ? "checked" : ""}" data-task-toggle="${escapeHtml(task.id)}" aria-label="${task.done ? "Mark incomplete" : "Mark complete"}">${task.done ? "✓" : ""}</button><span class="task-text">${escapeHtml(task.text)}</span><span class="priority ${task.priority}">${task.priority === "high" ? "High" : task.priority === "low" ? "Low" : "Normal"}</span><button class="delete-task" data-task-delete="${escapeHtml(task.id)}" aria-label="Delete task">×</button></div>`).join("") : `<div class="empty-inline">${filter === "completed" ? "No completed tasks yet." : filter === "active" ? "You're all caught up. Add a task when you're ready." : "No tasks yet. Add one small step to get started."}</div>`;
    const recent = tasks.filter(t => !t.done).slice(0, 3);
    $("overviewTasks").innerHTML = recent.length ? recent.map(task => `<div class="compact-task"><button class="task-check" data-task-toggle="${escapeHtml(task.id)}" aria-label="Complete task"></button><span class="task-text">${escapeHtml(task.text)}</span></div>`).join("") : `<div class="empty-inline">No open tasks. Enjoy the breathing room.</div>`;
    document.querySelectorAll("[data-task-toggle]").forEach(button => button.addEventListener("click", () => toggle(button.dataset.taskToggle)));
    document.querySelectorAll("[data-task-delete]").forEach(button => button.addEventListener("click", () => remove(button.dataset.taskDelete)));
  }
  function setFilter(value) {
    filter = value;
    document.querySelectorAll(".filter-tab").forEach(button => button.classList.toggle("active", button.dataset.filter === filter));
    render();
  }
  return { add, render, setFilter, clearCompleted, getTasks: () => [...tasks] };
})();
(() => {
  const $ = id => document.getElementById(id);
  let currentView = "overview";
  let latestPlanSteps = [];
  const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
  function toast(message, type = "") {
    const node = document.createElement("div");
    node.className = `toast ${type}`; node.textContent = message;
    $("toastRegion").appendChild(node);
    setTimeout(() => node.remove(), 3600);
  }
  function setStatus(connected, label) {
    ["sidebarStatusDot", "topStatusDot"].forEach(id => $(id).classList.toggle("connected", connected));
    $("sidebarStatus").textContent = connected ? "AI connected" : "AI disconnected";
    $("topStatus").textContent = label || (connected ? "Local AI connected" : "Local AI offline");
    $("sidebarModel").textContent = LocalAI.getSettings().model || "Ollama local model";
  }
  function go(view) {
    if (!$(`view-${view}`)) return;
    currentView = view;
    document.querySelectorAll(".view").forEach(section => section.classList.toggle("active", section.id === `view-${view}`));
    document.querySelectorAll(".nav-item[data-view]").forEach(button => button.classList.toggle("active", button.dataset.view === view));
    const title = view.charAt(0).toUpperCase() + view.slice(1);
    $("currentSection").textContent = title === "Ai" ? "AI Assistant" : title;
    $("sidebar").classList.remove("open");
    if (view === "tasks") TaskManager.render();
    if (view === "history") renderHistory();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function saveHistory(tool, input, output) {
    const history = Store.getHistory();
    history.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), tool, input: input.slice(0, 1200), output: output.slice(0, 5000), createdAt: Date.now() });
    Store.setHistory(history.slice(0, 40));
    if (currentView === "history") renderHistory();
  }
  function setOutput(id, text) {
    $(id).textContent = text;
  }
  async function runButton(button, work) {
    const original = button.innerHTML;
    button.disabled = true; button.innerHTML = '<span class="spinner">◌</span> Working…';
    try { await work(); }
    catch (error) { toast(error.message || "Something went wrong.", "error"); }
    finally { button.disabled = false; button.innerHTML = original; }
  }
  async function testConnection(showToast = true) {
    const status = $("connectionStatus");
    status.className = "connection-status"; status.textContent = "Checking local Ollama…";
    try {
      const result = await LocalAI.check();
      const found = result.models.includes(result.configuredModel) || result.models.some(name => name.split(":")[0] === result.configuredModel.split(":")[0]);
      status.className = "connection-status success";
      status.textContent = `Connected. ${result.models.length} model(s) available: ${result.models.join(", ") || "none installed"}. ${found ? "Configured model appears installed." : "Your selected model was not found; install it or choose an installed model."}`;
      setStatus(true, "Local AI connected");
      if (showToast) toast(found ? "Local AI connection successful." : "Connected to Ollama. Check your model name.");
      return result;
    } catch (error) {
      status.className = "connection-status error"; status.textContent = error.message;
      setStatus(false, "Local AI offline");
      if (showToast) toast(error.message, "error");
      return null;
    }
  }
  function openSettings() {
    const settings = Store.getSettings();
    $("ollamaUrl").value = settings.url; $("modelName").value = settings.model;
    $("settingsModal").classList.add("open");
    $("connectionStatus").className = "connection-status"; $("connectionStatus").textContent = "Test your connection to see available models.";
  }
  function closeSettings() { $("settingsModal").classList.remove("open"); }
  function saveSettings() {
    const url = $("ollamaUrl").value.trim().replace(/\/+$/, "");
    const model = $("modelName").value.trim();
    if (!/^https?:\/\/[^ ]+$/i.test(url)) { toast("Enter a valid HTTP or HTTPS address.", "error"); return; }
    if (!model) { toast("Enter a model name, for example gemma3:1b.", "error"); return; }
    Store.setSettings({ url, model }); setStatus(false, "Connection not tested");
    $("sidebarModel").textContent = model;
    toast("AI settings saved."); testConnection(false);
  }
  async function generateTo(inputId, outputId, buttonId, promptBuilder, toolName) {
    const input = $(inputId).value.trim();
    if (!input) { toast("Add some text first.", "error"); return; }
    await runButton($(buttonId), async () => {
      const result = await LocalAI.generate(promptBuilder(input));
      setOutput(outputId, result); saveHistory(toolName, input, result);
    });
  }
  function copyFrom(id) {
    const text = $(id).innerText.trim();
    if (!text || text.includes("Your summary will appear here.") || text.includes("Your better draft starts here.")) { toast("There's no output to copy yet.", "error"); return; }
    navigator.clipboard?.writeText(text).then(() => toast("Copied to clipboard.")).catch(() => {
      const area = document.createElement("textarea"); area.value = text; document.body.appendChild(area); area.select();
      try { document.execCommand("copy"); toast("Copied to clipboard."); } catch (_) { toast("Copy failed. Please select the text manually.", "error"); }
      area.remove();
    });
  }
  function renderHistory() {
    const history = Store.getHistory();
    $("historyList").innerHTML = history.length ? history.map(item => `<article class="history-item"><div class="history-meta"><span>${escapeHtml(item.tool)} · ${new Date(item.createdAt).toLocaleString()}</span><span>${item.output.length.toLocaleString()} characters</span></div><h4>${escapeHtml(item.input.slice(0, 110) || "Saved output")}</h4><p>${escapeHtml(item.output)}</p><button class="small-link" data-history-copy="${escapeHtml(item.id)}">Copy output</button></article>`).join("") : '<div class="empty-state"><span>◷</span><b>Your recent work will show up here.</b><p>Generate something with an AI tool to start your history.</p></div>';
    document.querySelectorAll("[data-history-copy]").forEach(button => button.addEventListener("click", () => {
      const item = history.find(entry => entry.id === button.dataset.historyCopy);
      if (item) navigator.clipboard.writeText(item.output).then(() => toast("Copied output.")).catch(() => toast("Clipboard access was blocked.", "error"));
    }));
  }
  function renderChatMessage(role, text) {
    const wrap = document.createElement("div");
    wrap.className = role === "user" ? "user-message" : "assistant-message";
    if (role !== "user") { const avatar = document.createElement("div"); avatar.className = "message-avatar"; avatar.textContent = "✳"; wrap.appendChild(avatar); }
    const bubble = document.createElement("div"); bubble.className = "message-bubble"; bubble.textContent = text; wrap.appendChild(bubble);
    $("chatMessages").appendChild(wrap); $("chatMessages").scrollTop = $("chatMessages").scrollHeight;
    return bubble;
  }
  async function sendChat(text) {
    if (!text.trim()) return;
    renderChatMessage("user", text);
    const placeholder = renderChatMessage("assistant", "Thinking locally…");
    $("chatInput").value = ""; $("chatSend").disabled = true;
    try {
      const response = await LocalAI.generate(text);
      placeholder.textContent = response; saveHistory("AI Assistant", text, response);
    } catch (error) { placeholder.textContent = `I couldn't connect to the model. ${error.message}`; toast(error.message, "error"); }
    finally { $("chatSend").disabled = false; $("chatInput").focus(); }
  }
  function init() {
    $("todayDate").textContent = new Date().toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
    if (Store.getTheme() === "light") document.body.classList.add("light-theme");
    TaskManager.render();
    document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => go(button.dataset.view)));
    document.querySelectorAll("[data-go]").forEach(button => button.addEventListener("click", () => go(button.dataset.go)));
    $("mobileMenu").addEventListener("click", () => $("sidebar").classList.toggle("open"));
    $("openSettings").addEventListener("click", openSettings); $("headerSettings").addEventListener("click", openSettings);
    $("closeSettings").addEventListener("click", closeSettings);
    $("settingsModal").addEventListener("click", event => { if (event.target === $("settingsModal")) closeSettings(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape") closeSettings(); });
    $("testConnection").addEventListener("click", () => testConnection(true));
    $("saveSettings").addEventListener("click", saveSettings);
    $("themeToggle").addEventListener("click", () => {
      document.body.classList.toggle("light-theme");
      Store.setTheme(document.body.classList.contains("light-theme") ? "light" : "dark");
      toast(`Switched to ${Store.getTheme()} appearance.`);
    });
    $("privacyDetails").addEventListener("click", () => toast("Local mode sends prompts to the Ollama server address you configure. Browser tasks and history are saved in local storage."));
    $("writerRun").addEventListener("click", () => generateTo("writerInput", "writerOutput", "writerRun", input => `Rewrite and improve the following text in a ${$("writerStyle").value.toLowerCase()} style. Preserve the intended meaning, correct grammar, and return only the improved version.\n\nTEXT:\n${input}`, "Smart Writer"));
    $("summaryRun").addEventListener("click", () => generateTo("summaryInput", "summaryOutput", "summaryRun", input => {
      const mode = $("summaryLength").value;
      const instructions = { brief: "Write a brief overview in 3–5 sentences.", balanced: "Write a balanced summary with the main ideas and important details.", detailed: "Create detailed, well-structured notes with headings and key details.", bullets: "Summarize as concise bullet points and include key takeaways." };
      return `${instructions[mode]} Do not invent information absent from the source.\n\nSOURCE TEXT:\n${input}`;
    }, "Summarizer"));
    $("studyRun").addEventListener("click", () => generateTo("studyInput", "studyOutput", "studyRun", input => {
      const mode = $("studyMode").value;
      const instructions = { explain: "Explain this topic in simple language, define key terms, use an example, and finish with a short recap.", notes: "Create clear revision notes with headings, key definitions, important facts, and a quick recap.", quiz: "Create 8 practice questions of mixed difficulty, then provide a separate answer key after the questions.", flashcards: "Create 8 study flashcards formatted as FRONT: and BACK:, with concise answers." };
      return `${instructions[mode]} Be accurate and distinguish uncertain claims. Use this topic or source material:\n\n${input}`;
    }, "Study Helper"));
    $("plannerRun").addEventListener("click", () => generateTo("plannerGoal", "plannerOutput", "plannerRun", input => `Create a realistic, encouraging action plan for this goal. Time available: ${$("plannerTime").value}. Energy level: ${$("plannerEnergy").value}. Give 4–8 numbered, specific steps, each starting with a checkbox symbol [ ]. Keep each step short and actionable. Finish with a tiny first step that takes under five minutes. Avoid unrealistic promises.\n\nGOAL:\n${input}`, "Task Planner").then(() => {
      const text = $("plannerOutput").innerText;
      latestPlanSteps = text.split("\\n").filter(line => /^\s*(?:\[\s?\]|\d+[.)])\s*/.test(line)).map(line => line.replace(/^\s*(?:\[\s?\]|\d+[.)])\s*/, "").trim()).filter(Boolean);
      $("addPlanTasks").disabled = latestPlanSteps.length === 0;
    }));
    $("writerCopy").addEventListener("click", () => copyFrom("writerOutput"));
    $("summaryCopy").addEventListener("click", () => copyFrom("summaryOutput"));
    $("studyCopy").addEventListener("click", () => copyFrom("studyOutput"));
    $("addPlanTasks").addEventListener("click", () => {
      latestPlanSteps.forEach(step => TaskManager.add(step));
      toast(`${latestPlanSteps.length} step(s) added to My Tasks.`); go("tasks");
    });
    $("chatForm").addEventListener("submit", event => { event.preventDefault(); sendChat($("chatInput").value); });
    $("chatInput").addEventListener("keydown", event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); $("chatForm").requestSubmit(); } });
    document.querySelectorAll("[data-prompt]").forEach(button => button.addEventListener("click", () => { $("chatInput").value = button.dataset.prompt; $("chatInput").focus(); }));
    $("taskForm").addEventListener("submit", event => { event.preventDefault(); if (TaskManager.add($("taskInput").value, $("taskPriority").value)) { $("taskInput").value = ""; toast("Task added."); } });
    $("quickAddForm").addEventListener("submit", event => { event.preventDefault(); if (TaskManager.add($("quickTaskInput").value)) { $("quickTaskInput").value = ""; toast("Task added."); } });
    document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => TaskManager.setFilter(button.dataset.filter)));
    $("clearCompleted").addEventListener("click", () => { TaskManager.clearCompleted(); toast("Completed tasks cleared."); });
    $("clearHistory").addEventListener("click", () => {
      if (confirm("Clear all saved AI history from this browser?")) { Store.setHistory([]); renderHistory(); toast("History cleared."); }
    });
    setStatus(false, "Local AI offline");
    // Check quietly on load. The website still works as a task manager when AI is unavailable.
    LocalAI.check().then(result => {
      const modelFound = result.models.includes(result.configuredModel) || result.models.some(name => name.split(":")[0] === result.configuredModel.split(":")[0]);
      setStatus(true, modelFound ? "Local AI connected" : "Ollama connected · model check needed");
    }).catch(() => setStatus(false, "Local AI offline"));
  }
  document.addEventListener("DOMContentLoaded", init);
})();
