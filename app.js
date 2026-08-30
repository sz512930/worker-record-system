(function () {
  "use strict";

  function showToast(message, type) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show${type === "error" ? " error" : ""}`;
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => { toast.className = "toast"; }, 3600);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  }

  window.WorkerUi = { showToast, escapeHtml };

  const form = document.getElementById("staff-form");
  if (!form) return;

  const api = window.WorkerApi;
  const avatarInput = document.getElementById("avatar");
  const avatarImage = document.getElementById("avatar-image");
  const avatarPlaceholder = document.getElementById("avatar-placeholder");
  const avatarFileName = document.getElementById("avatar-file-name");
  const resumeInput = document.getElementById("resume");
  const resumeFileName = document.getElementById("resume-file-name");
  const introduction = document.getElementById("introduction");
  const introCount = document.getElementById("intro-count");
  const submitButton = document.getElementById("submit-button");
  const apiStatus = document.getElementById("api-status");
  let currentRecord = null;
  let previewUrl = "";

  function setBusy(busy) {
    submitButton.disabled = busy;
    submitButton.textContent = busy ? "正在保存…" : currentRecord ? "保存修改" : "保存资料";
  }

  async function updateApiStatus() {
    if (!apiStatus) return;
    try {
      // Use the same lightweight staff API that the page needs. The aggregate
      // health endpoint also checks RustFS, so a temporary object-storage issue
      // should not make the registration form claim that the API is offline.
      await api.listStaff({ sort: "newest" });
      apiStatus.textContent = "本机 API 已连接";
    } catch {
      apiStatus.textContent = "本机 API 不可用";
      showToast("无法连接本机后端，请确认 API 已启动。", "error");
    }
  }

  function displayAvatar(url, fileName) {
    avatarFileName.textContent = fileName || "尚未选择";
    if (url) {
      avatarImage.src = url;
      avatarImage.hidden = false;
      avatarPlaceholder.hidden = true;
    } else {
      avatarImage.removeAttribute("src");
      avatarImage.hidden = true;
      avatarPlaceholder.hidden = false;
    }
  }

  function payloadFromForm() {
    const data = new FormData(form);
    return {
      name: String(data.get("name")).trim(), gender: data.get("gender"), age: Number(data.get("age")),
      phone: String(data.get("phone") || "").trim(), city: String(data.get("city")).trim(),
      department: data.get("department"), position: String(data.get("position")).trim(), level: data.get("level"),
      joinDate: data.get("joinDate"), introduction: String(data.get("introduction") || "").trim(),
      skills: String(data.get("skills") || "").split(/[，,、]/).map((item) => item.trim()).filter(Boolean)
    };
  }

  function populateForEditing(record) {
    currentRecord = record;
    document.getElementById("record-id").value = record.id;
    ["name", "gender", "age", "phone", "city", "department", "position", "level"].forEach((name) => {
      document.getElementById(name).value = record[name] ?? "";
    });
    document.getElementById("join-date").value = record.joinDate || "";
    introduction.value = record.introduction || "";
    document.getElementById("skills").value = (record.skills || []).join("、");
    introCount.textContent = introduction.value.length;
    displayAvatar(record.avatar ? `${api.apiUrl(record.avatar.url)}?v=${encodeURIComponent(record.updatedAt || Date.now())}` : "", record.avatarOriginalName);
    resumeFileName.textContent = record.resume?.originalName || "尚未选择";
    document.getElementById("page-title").textContent = "编辑工作人员资料";
    document.getElementById("page-description").textContent = `正在编辑：${record.name}`;
    document.getElementById("cancel-edit").hidden = false;
    setBusy(false);
  }

  avatarInput.addEventListener("change", () => {
    const selected = avatarInput.files[0];
    if (!selected) return;
    if (!/^image\/(jpeg|png|webp)$/.test(selected.type) || selected.size > 5 * 1024 * 1024) {
      avatarInput.value = "";
      showToast("请选择 5MB 以内的 JPG、PNG 或 WebP 图片。", "error");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(selected);
    displayAvatar(previewUrl, selected.name);
  });

  resumeInput.addEventListener("change", () => {
    const selected = resumeInput.files[0];
    if (!selected) return;
    if (selected.size > 10 * 1024 * 1024) {
      resumeInput.value = "";
      showToast("简历文件不能超过 10MB。", "error");
      return;
    }
    resumeFileName.textContent = `${selected.name}（${selected.type || "未知类型"}，${Math.ceil(selected.size / 1024)} KB）`;
  });

  introduction.addEventListener("input", () => { introCount.textContent = introduction.value.length; });
  form.addEventListener("input", (event) => event.target.classList?.remove("invalid"));

  async function loadEditRecord() {
    const editId = new URLSearchParams(window.location.search).get("edit");
    if (!editId) return;
    setBusy(true);
    try { populateForEditing(await api.getStaff(editId)); }
    catch (error) { showToast(`无法读取待编辑资料：${error.message}`, "error"); setBusy(false); }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const required = [...form.querySelectorAll("[required]")];
    const invalid = required.filter((field) => !field.checkValidity());
    if (invalid.length) {
      invalid.forEach((field) => field.classList.add("invalid")); invalid[0].focus();
      showToast("请先完整填写所有必填项。", "error"); return;
    }
    setBusy(true);
    try {
      const record = currentRecord ? await api.updateStaff(currentRecord.id, payloadFromForm()) : await api.createStaff(payloadFromForm());
      currentRecord = record;
      const failures = [];
      if (avatarInput.files[0]) {
        try { currentRecord = await api.uploadAvatar(record.id, avatarInput.files[0]); }
        catch (error) { failures.push(`头像上传失败：${error.message}`); }
      }
      if (resumeInput.files[0]) {
        try { currentRecord = await api.uploadResume(record.id, resumeInput.files[0]); }
        catch (error) { failures.push(`简历上传失败：${error.message}`); }
      }
      if (failures.length) {
        showToast(`资料已保存；${failures.join("；")} 可重新选择文件后重试。`, "error");
        populateForEditing(await api.getStaff(record.id));
        return;
      }
      if (new URLSearchParams(window.location.search).get("edit")) {
        showToast("修改已保存，即将返回人员管理。");
        window.setTimeout(() => window.location.assign("admin.html"), 650);
      } else {
        form.reset(); currentRecord = null; displayAvatar("", ""); resumeFileName.textContent = "尚未选择"; introCount.textContent = "0";
        showToast("资料与已选择文件已保存到本机服务。"); setBusy(false);
      }
    } catch (error) { showToast(`保存失败：${error.message}`, "error"); setBusy(false); }
  });

  updateApiStatus();
  loadEditRecord();
})();
