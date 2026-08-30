(function () {
  "use strict";
  const { showToast, escapeHtml } = window.WorkerUi;
  const api = window.WorkerApi;
  const tableBody = document.getElementById("staff-table-body");
  const emptyState = document.getElementById("empty-state");
  const tableScroll = document.querySelector(".table-scroll");
  const detailDialog = document.getElementById("detail-dialog");
  const detailContent = document.getElementById("detail-content");
  const filters = { name: document.getElementById("search-name"), department: document.getElementById("filter-department"), level: document.getElementById("filter-level"), gender: document.getElementById("filter-gender"), sort: document.getElementById("sort-by") };
  const apiStatus = document.getElementById("api-status");
  let allRecords = [];

  function initials(name) { return String(name || "人").trim().slice(-2); }
  function fileSize(bytes) { return bytes ? (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`) : ""; }
  function avatarMarkup(record, className) {
    const src = record.avatar ? `${api.apiUrl(record.avatar.url)}?v=${encodeURIComponent(record.updatedAt || Date.now())}` : "";
    return src ? `<span class="${className}"><img src="${escapeHtml(src)}" alt="${escapeHtml(record.name)}的头像" /></span>` : `<span class="${className}" aria-hidden="true">${escapeHtml(initials(record.name))}</span>`;
  }
  function updateStats(records) {
    document.getElementById("total-count").textContent = records.length;
    document.getElementById("department-count").textContent = new Set(records.map((item) => item.department).filter(Boolean)).size;
    const now = new Date();
    document.getElementById("month-count").textContent = records.filter((item) => { const date = new Date(item.createdAt); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(); }).length;
  }
  function render(records, total) {
    updateStats(allRecords);
    document.getElementById("result-summary").textContent = `显示 ${records.length} 条，共 ${total} 条记录`;
    tableBody.innerHTML = records.map((record) => `<tr><td><div class="person-cell">${avatarMarkup(record, "table-avatar")}<span>${escapeHtml(record.name)}</span></div></td><td>${escapeHtml(record.gender)}</td><td>${escapeHtml(record.age)}</td><td>${escapeHtml(record.department)}</td><td>${escapeHtml(record.position)}</td><td><span class="level-badge" data-level="${escapeHtml(record.level)}">${escapeHtml(record.level)}</span></td><td>${escapeHtml(record.city)}</td><td><div class="table-actions"><button class="action-button" type="button" data-action="view" data-id="${record.id}">详情</button><button class="action-button" type="button" data-action="edit" data-id="${record.id}">编辑</button><button class="action-button danger" type="button" data-action="delete" data-id="${record.id}">删除</button></div></td></tr>`).join("");
    emptyState.hidden = records.length !== 0; tableScroll.hidden = records.length === 0;
  }
  async function loadRecords() {
    tableBody.innerHTML = '<tr><td colspan="8" class="loading-cell">正在从本机数据库读取资料…</td></tr>';
    try {
      const requested = Object.fromEntries(Object.entries(filters).map(([key, control]) => [key, control.value.trim()]));
      const data = await api.listStaff(requested);
      const all = await api.listStaff({ sort: "newest" });
      if (apiStatus) apiStatus.textContent = "本机 API 已连接";
      allRecords = all.items; render(data.items, data.total);
    } catch (error) {
      tableBody.innerHTML = ""; allRecords = []; updateStats([]); emptyState.hidden = false; tableScroll.hidden = true;
      document.getElementById("result-summary").textContent = "无法读取本机 API";
      if (apiStatus) apiStatus.textContent = "本机 API 不可用";
      showToast(`无法加载人员列表：${error.message}`, "error");
    }
  }
  function detailItem(label, value) { return `<div class="detail-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || "未填写")}</strong></div>`; }
  async function showDetails(id) {
    detailContent.innerHTML = '<p class="detail-copy">正在读取详情…</p>'; detailDialog.showModal();
    try {
      const record = await api.getStaff(id);
      const skills = record.skills?.length ? record.skills.map((skill) => `<span class="skill-tag">${escapeHtml(skill)}</span>`).join("") : '<span class="detail-copy">未填写技能标签</span>';
      const resume = record.resume ? `<a class="download-link" href="${escapeHtml(api.apiUrl(record.resume.url))}">下载：${escapeHtml(record.resume.originalName)}${record.resume.size ? `（${fileSize(record.resume.size)}）` : ""}</a>` : '<p class="detail-copy">未选择简历文件</p>';
      detailContent.innerHTML = `<div class="detail-hero">${avatarMarkup(record, "detail-avatar")}<div><h2 id="detail-name">${escapeHtml(record.name)}</h2><p>${escapeHtml(record.department)} · ${escapeHtml(record.position)} · ${escapeHtml(record.level)}</p></div></div><div class="detail-body"><section class="detail-section"><h3>基础资料</h3><div class="detail-grid">${detailItem("性别", record.gender)}${detailItem("年龄", `${record.age} 岁`)}${detailItem("联系电话", record.phone)}${detailItem("所在城市", record.city)}</div></section><section class="detail-section"><h3>工作信息</h3><div class="detail-grid">${detailItem("部门", record.department)}${detailItem("职位", record.position)}${detailItem("级别", record.level)}${detailItem("入职时间", record.joinDate)}</div></section><section class="detail-section"><h3>个人简介</h3><p class="detail-copy">${escapeHtml(record.introduction || "未填写个人简介")}</p></section><section class="detail-section"><h3>技能标签</h3><div class="skill-list">${skills}</div></section><section class="detail-section"><h3>简历文件</h3>${resume}</section></div>`;
    } catch (error) { detailContent.innerHTML = `<p class="detail-copy">无法读取详情：${escapeHtml(error.message)}</p>`; }
  }
  async function handleDelete(id) {
    const record = allRecords.find((item) => String(item.id) === String(id));
    if (!record || !window.confirm(`确定删除“${record.name}”的资料吗？关联的头像和简历也会删除。`)) return;
    try { await api.deleteStaff(id); await loadRecords(); showToast("资料及关联文件已删除。"); }
    catch (error) { showToast(`删除失败：${error.message}`, "error"); }
  }
  document.getElementById("filter-form").addEventListener("submit", (event) => { event.preventDefault(); loadRecords(); });
  Object.values(filters).forEach((control) => control.addEventListener("change", loadRecords));
  filters.name.addEventListener("input", () => { window.clearTimeout(loadRecords.timer); loadRecords.timer = window.setTimeout(loadRecords, 220); });
  document.getElementById("reset-filters").addEventListener("click", () => { document.getElementById("filter-form").reset(); loadRecords(); });
  tableBody.addEventListener("click", (event) => { const button = event.target.closest("[data-action]"); if (!button) return; if (button.dataset.action === "view") showDetails(button.dataset.id); if (button.dataset.action === "edit") window.location.assign(`index.html?edit=${encodeURIComponent(button.dataset.id)}`); if (button.dataset.action === "delete") handleDelete(button.dataset.id); });
  document.getElementById("close-dialog").addEventListener("click", () => detailDialog.close());
  detailDialog.addEventListener("click", (event) => { if (event.target === detailDialog) detailDialog.close(); });
  loadRecords();
})();
