(function () {
  const palette = {
    person: "#e46f61",
    equipment: "#2f80b7",
    software: "#7b61d1",
    shared: "#d89b24",
    edge: "#9eb1be",
    edgeHighlight: "#1f6f8b",
    mutedNode: "#d9dee2",
    mutedText: "#91a0aa"
  };
  const typeLabelMap = { person: "成员", equipment: "仪器设备", software: "软件工具" };
  const supabaseUrl = "https://vamnxspbtqqogaxburqc.supabase.co";
  const supabaseKey = "sb_publishable_797FGKGhkCKn-NJSNsKjVw_T0_Je0LY";
  const storageKey = "teamGraphUserDataV3";
  const oldStorageKey = "teamGraphUserDataV2";
  const operatorPassword = "g6team2026";
  const operatorSessionKey = "teamGraphOperatorSession";
  const $ = (id) => document.getElementById(id);
  const baseData = window.teamGraphData || { teachers: [], people: [] };
  const userData = loadUserData();
  const rawData = { teachers: [], people: [] };
  const peopleById = new Map();
  const state = { focusedNodeId: null, searchTerm: "", typeFilter: "all", selectedGrade: "all" };
  let structure = null;
  let graph = null;
  let currentFormType = "person";
  let editContext = null;
  let avatarContext = null;
  const defaultProfiles = {
    "person-liuxuan": { grade: "2022\u7ea7", birthYear: "2002", graduationStatus: "\u5df2\u6bd5\u4e1a" },
    "person-wangzhengxin": { grade: "2022\u7ea7", birthYear: "2002", graduationStatus: "\u5df2\u6bd5\u4e1a" },
    "person-linian": { grade: "2023\u7ea7", birthYear: "2003", graduationStatus: "\u672a\u6bd5\u4e1a" },
    "person-songchenqi": { grade: "2023\u7ea7", birthYear: "2003", graduationStatus: "\u672a\u6bd5\u4e1a" },
    "person-huyuhan": { grade: "2024\u7ea7", birthYear: "2004", graduationStatus: "\u672a\u6bd5\u4e1a" },
    "person-nijialu": { grade: "2024\u7ea7", birthYear: "2004", graduationStatus: "\u672a\u6bd5\u4e1a" },
    "person-zhangshiyu": { grade: "2025\u7ea7", birthYear: "2005", graduationStatus: "\u672a\u6bd5\u4e1a" },
    "person-misiyan": { grade: "2025\u7ea7", birthYear: "2005", graduationStatus: "\u672a\u6bd5\u4e1a" }
  };

  const searchInput = $("searchInput");
  const typeFilter = $("typeFilter");
  const resetButton = $("resetButton");
  const graphContainer = $("graphContainer");
  const detailTitle = $("detailTitle");
  const detailSubtitle = $("detailSubtitle");
  const detailMeta = $("detailMeta");
  const detailContent = $("detailContent");
  const infoDialog = $("infoDialog");
  const infoForm = $("infoForm");
  const formFields = $("formFields");
  const dialogTitle = $("dialogTitle");
  const personDialog = $("personDialog");
  const personDialogContent = $("personDialogContent");
  const avatarFileInput = $("avatarFileInput");
  const permissionStatus = $("permissionStatus");
  const permissionHint = $("permissionHint");
  const operatorPasswordInput = $("operatorPassword");
  const operatorLogin = $("operatorLogin");
  const operatorLogout = $("operatorLogout");
  const togglePublicEdit = $("togglePublicEdit");
  const manageActions = $("manageActions");

  function defaultUserData() {
    return { teachers: [], people: [], resourcePeople: [], deletedTeacherIds: [], deletedPersonIds: [], permissions: { publicEdit: false } };
  }

  function isOperator() {
    return sessionStorage.getItem(operatorSessionKey) === "true";
  }

  function canEdit() {
    return isOperator() || !!userData.permissions?.publicEdit;
  }

  function requireEditPermission() {
    if (canEdit()) return true;
    window.alert("当前为只读模式，请联系操作者开放修改权限。");
    return false;
  }

  function loadUserData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey)) || defaultUserData();
      return { ...defaultUserData(), ...parsed };
    } catch (error) {
      return defaultUserData();
    }
  }

  async function loadCloudData() {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/team_graph_data?id=eq.main&select=data`, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`
        }
      });
      if (!response.ok) throw new Error(`Supabase read failed: ${response.status}`);
      const rows = await response.json();
      const cloudData = rows[0]?.data;
      if (cloudData && Object.keys(cloudData).length) {
        Object.assign(userData, { ...defaultUserData(), ...cloudData });
        localStorage.setItem(storageKey, JSON.stringify(userData));
      }
    } catch (error) {
      console.warn("云端数据读取失败，已使用本地缓存。", error);
    }
  }

  function saveUserData() {
    localStorage.setItem(storageKey, JSON.stringify(userData));
    saveCloudData();
  }

  async function saveCloudData() {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/team_graph_data?id=eq.main`, {
        method: "PATCH",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          data: userData,
          updated_at: new Date().toISOString()
        })
      });
      if (!response.ok) throw new Error(`Supabase write failed: ${response.status}`);
    } catch (error) {
      console.warn("云端数据保存失败，数据已保存在本地。", error);
    }
  }

  function rebuildRawData() {
    const deletedTeachers = new Set(userData.deletedTeacherIds);
    const deletedPeople = new Set(userData.deletedPersonIds);
    const teacherOverrides = new Map(userData.teachers.map((teacher) => [teacher.id, teacher]));
    const peopleOverrides = new Map(userData.people.map((person) => [person.id, person]));
    rawData.teachers = (baseData.teachers || [])
      .filter((teacher) => !deletedTeachers.has(teacher.id))
      .map((teacher) => ({ ...teacher, ...(teacherOverrides.get(teacher.id) || {}) }));
    userData.teachers.forEach((teacher) => {
      if (!(baseData.teachers || []).some((item) => item.id === teacher.id) && !deletedTeachers.has(teacher.id)) rawData.teachers.push(teacher);
    });
    rawData.people = (baseData.people || [])
      .filter((person) => !deletedPeople.has(person.id))
      .map((person) => applyPersonDefaults({ ...person, ...(peopleOverrides.get(person.id) || {}) }));
    userData.people.forEach((person) => {
      if (!(baseData.people || []).some((item) => item.id === person.id) && !deletedPeople.has(person.id)) rawData.people.push(applyPersonDefaults(person));
    });
    (userData.resourcePeople || []).forEach((person) => {
      if (!deletedPeople.has(person.id)) rawData.people.push(applyPersonDefaults(person));
    });
    peopleById.clear();
    rawData.people.forEach((person) => peopleById.set(person.id, person));
  }

  function upsertUserRecord(kind, record) {
    const collection = kind === "teacher" ? userData.teachers : userData.people;
    const index = collection.findIndex((item) => item.id === record.id);
    if (index >= 0) collection[index] = record;
    else collection.push(record);
  }

  function deleteRecord(kind, id) {
    if (kind === "teacher") {
      userData.teachers = userData.teachers.filter((item) => item.id !== id);
      if ((baseData.teachers || []).some((item) => item.id === id) && !userData.deletedTeacherIds.includes(id)) userData.deletedTeacherIds.push(id);
    } else {
      userData.people = userData.people.filter((item) => item.id !== id);
      userData.resourcePeople = userData.resourcePeople.filter((item) => item.id !== id);
      if ((baseData.people || []).some((item) => item.id === id) && !userData.deletedPersonIds.includes(id)) userData.deletedPersonIds.push(id);
    }
    saveUserData();
    rebuildRawData();
    refreshGraph();
  }

  function escapeHTML(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function splitList(value) {
    return String(value || "").split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean);
  }

  function joinList(value) {
    return (value || []).join("，");
  }

  function getPersonGrade(person) {
    return String(person.grade || person.year || "未分年级").trim() || "未分年级";
  }

  function getGraduationStatus(person) {
    return String(person.graduationStatus || person.status || "未毕业").trim() || "未毕业";
  }

  function getBirthYear(person) {
    const value = String(person.birthYear || person.birth || "").trim();
    if (value) return value;
    const age = Number(person.age);
    return Number.isFinite(age) && age > 0 ? String(new Date().getFullYear() - age) : "出生年份待补充";
  }

  function renderBirthYearStatus(person) {
    const status = getGraduationStatus(person);
    const statusClass = status === "已毕业" ? "is-graduated" : "is-studying";
    return `${escapeHTML(getBirthYear(person))}年 <span class="status-badge ${statusClass}">(${escapeHTML(status)})</span>`;
  }

  function renderValue(value) {
    if (Array.isArray(value)) return value.length ? `<ul>${value.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>` : '<p class="empty-state">暂未填写</p>';
    return `<p>${escapeHTML(value || "暂未填写")}</p>`;
  }

  function getPersonExtraItems(person) {
    return [
      ["email", "邮箱", person.email],
      ["wechat", "微信号", person.wechat],
      ["phone", "手机号", person.phone],
      ["hobbies", "个人爱好", person.hobbies],
      ["career", "工作去向", person.career],
      ["achievements", "科研成果", person.achievements]
    ];
  }

  function renderDetailExtraButtons(person) {
    const items = getPersonExtraItems(person);
    return `<div class="detail-info-buttons">${items.map(([key, label]) => `<button class="detail-toggle" type="button" data-detail-extra="${key}">${label}</button>`).join("")}</div><div id="detailExtraPanel" class="detail-extra-panel">点击上方按钮查看对应信息</div>`;
  }

  function renderInlineValue(value) {
    if (Array.isArray(value)) return value.length ? value.map(escapeHTML).join("、") : "暂未填写";
    return escapeHTML(value || "暂未填写");
  }

  function renderFullPersonDialog(person) {
    const infoRows = [
      ["邮箱", person.email],
      ["微信号", person.wechat],
      ["手机号", person.phone],
      ["个人爱好", person.hobbies],
      ["工作去向", person.career],
      ["科研成果", person.achievements]
    ];
    personDialogContent.innerHTML = `
      <div class="person-dialog-hero">
        <img class="person-dialog-avatar" src="${escapeHTML(person.avatar || fallbackAvatar(person.id))}" alt="${escapeHTML(person.name)}头像">
        <div>
          <p class="eyebrow">Member Profile</p>
          <h2>${escapeHTML(person.name)}</h2>
          <p class="person-dialog-subtitle">${escapeHTML(person.role || "成员")} · ${escapeHTML(getPersonGrade(person))} · ${renderBirthYearStatus(person)}</p>
          <p>${escapeHTML(person.group || "未填写方向组")}</p>
        </div>
      </div>
      <div class="person-dialog-grid">
        ${infoRows.map(([label, value]) => `<section><h3>${escapeHTML(label)}</h3><p>${renderInlineValue(value)}</p></section>`).join("")}
      </div>
      <div class="person-dialog-sections">
        <section><h3>个人简介</h3><p>${escapeHTML(person.bio || "暂无简介。")}</p></section>
        <section><h3>论文进度</h3>${renderPaperList(person)}</section>
        <section><h3>研究方向</h3><ul>${(person.directions || []).map((item) => `<li>${escapeHTML(item)}</li>`).join("") || "<li>暂未填写</li>"}</ul></section>
        <section><h3>技术方法分析</h3><ul>${(person.skills || []).map((item) => `<li>${escapeHTML(item)}</li>`).join("") || "<li>暂未填写</li>"}</ul></section>
        <section><h3>仪器设备</h3><ul>${(person.equipment || []).map((item) => `<li>${escapeHTML(item)}</li>`).join("") || "<li>暂未填写</li>"}</ul></section>
        <section><h3>软件工具</h3><ul>${(person.software || []).map((item) => `<li>${escapeHTML(item)}</li>`).join("") || "<li>暂未填写</li>"}</ul></section>
      </div>`;
    personDialog.showModal();
  }

  function slugify(value) {
    return String(value).trim().toLowerCase().replace(/\s+/g, "-");
  }

  function fallbackAvatar(seed, color) {
    return `https://api.dicebear.com/8.x/notionists/svg?seed=${encodeURIComponent(seed || "member")}&backgroundColor=${color || "e0f2fe"}`;
  }

  function applyPersonDefaults(person) {
    return {
      email: "",
      wechat: "",
      phone: "",
      hobbies: [],
      career: "",
      achievements: [],
      birthYear: "",
      graduationStatus: "未毕业",
      ...defaultProfiles[person.id],
      ...person
    };
  }

  function truncateLabel(text, maxLength) {
    return text && text.length > maxLength ? `${text.slice(0, maxLength - 1)}...` : text || "";
  }

  function getCanvasSize() {
    return { width: graphContainer.scrollWidth || 1200, height: graphContainer.scrollHeight || 720 };
  }

  function countValues(key) {
    const counts = new Map();
    rawData.people.forEach((person) => (person[key] || []).forEach((item) => counts.set(item, (counts.get(item) || 0) + 1)));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"));
  }

  function createGraphStructure(data) {
    const nodes = [];
    const edges = [];
    const adjacency = new Map();
    const abilityMap = new Map();
    function connect(source, target) {
      if (!adjacency.has(source)) adjacency.set(source, new Set());
      if (!adjacency.has(target)) adjacency.set(target, new Set());
      adjacency.get(source).add(target);
      adjacency.get(target).add(source);
    }
    data.people.forEach((person) => {
      nodes.push({ id: person.id, label: person.name, shortLabel: person.name, type: "person", data: person });
      if (!adjacency.has(person.id)) adjacency.set(person.id, new Set());
    });
    data.people.forEach((person) => {
      [["equipment", person.equipment || []], ["software", person.software || []]].forEach(([type, values]) => {
        values.forEach((value) => {
          const nodeId = `${type}-${slugify(value)}`;
          if (!abilityMap.has(nodeId)) abilityMap.set(nodeId, { id: nodeId, label: value, shortLabel: value, type, members: new Set() });
          abilityMap.get(nodeId).members.add(person.id);
          connect(person.id, nodeId);
          edges.push({ source: person.id, target: nodeId });
        });
      });
    });
    abilityMap.forEach((ability) => {
      nodes.push({ id: ability.id, label: ability.label, shortLabel: ability.shortLabel, type: ability.type, data: { ...ability, members: Array.from(ability.members) } });
    });
    return { nodes, edges, adjacency, abilityMap };
  }

  function renderWebsiteSections() {
    const equipmentCounts = countValues("equipment");
    const softwareCounts = countValues("software");
    const sharedTotal = Array.from(structure.abilityMap.values()).filter((item) => item.members.size > 1).length;
    $("heroPersonCount").textContent = rawData.people.length;
    $("heroResourceCount").textContent = equipmentCounts.length + softwareCounts.length;
    $("heroSharedCount").textContent = sharedTotal;
    $("personCount").textContent = rawData.people.length;
    $("abilityCount").textContent = structure.nodes.filter((node) => node.type !== "person").length;
    $("sharedCount").textContent = sharedTotal;
    $("teacherGrid").innerHTML = rawData.teachers.map(renderTeacherCard).join("");
    renderGradeControls();
    renderMemberGrid();
    renderPermissionPanel();
    $("equipmentList").innerHTML = equipmentCounts.map(([name, count]) => `<span class="resource-pill">${escapeHTML(name)}<b>${count}</b></span>`).join("");
    $("softwareList").innerHTML = softwareCounts.map(([name, count]) => `<span class="resource-pill">${escapeHTML(name)}<b>${count}</b></span>`).join("");
  }

  function renderPermissionPanel() {
    const operator = isOperator();
    const editable = canEdit();
    manageActions.hidden = !editable;
    operatorPasswordInput.hidden = operator;
    operatorLogin.hidden = operator;
    operatorLogout.hidden = !operator;
    togglePublicEdit.hidden = !operator;
    togglePublicEdit.textContent = userData.permissions?.publicEdit ? "关闭所有人修改" : "开放所有人修改";
    permissionStatus.textContent = operator ? "操作者管理模式" : editable ? "所有人可修改模式" : "只读查阅模式";
    permissionHint.textContent = operator
      ? "你可以修改内容，也可以开放或关闭其他人的修改权限。"
      : editable
        ? "操作者已开放修改权限，所有访问者都可以编辑内容。"
        : "普通访问者只能查阅内容，不能修改。";
  }

  function renderEditActions(kind, id) {
    if (!canEdit()) return "";
    const escapedKind = escapeHTML(kind);
    const escapedId = escapeHTML(id);
    const avatarButton = `<button type="button" data-avatar-kind="${escapedKind}" data-avatar-id="${escapedId}">更换头像</button>`;
    const deleteButton = `<button class="danger-action" type="button" data-delete-kind="${escapedKind}" data-delete-id="${escapedId}">删除</button>`;
    if (kind === "person") {
      return `<button type="button" data-edit-kind="person" data-edit-id="${escapedId}">修改</button><button type="button" data-paper-id="${escapedId}">论文进度</button>${avatarButton}${deleteButton}`;
    }
    return `<button type="button" data-edit-kind="teacher" data-edit-id="${escapedId}">修改</button>${avatarButton}${deleteButton}`;
  }

  function getGrades() {
    return Array.from(new Set(rawData.people.map(getPersonGrade))).sort((a, b) => a.localeCompare(b, "zh-CN", { numeric: true }));
  }

  function getGradeStatus(grade) {
    const members = rawData.people.filter((person) => getPersonGrade(person) === grade);
    return members.length && members.every((person) => getGraduationStatus(person) === "已毕业") ? "已毕业" : "未毕业";
  }

  function renderGradeStatusBadge(grade) {
    const status = getGradeStatus(grade);
    const statusClass = status === "已毕业" ? "is-graduated" : "is-studying";
    return `<span class="status-badge grade-status ${statusClass}">(${escapeHTML(status)})</span>`;
  }

  function renderGradeControls() {
    const grades = getGrades();
    if (state.selectedGrade !== "all" && !grades.includes(state.selectedGrade)) state.selectedGrade = "all";
    $("gradeButtons").innerHTML = [
      `<button class="grade-button ${state.selectedGrade === "all" ? "is-active" : ""}" type="button" data-grade="all">全部年级</button>`,
      ...grades.map((grade) => `<button class="grade-button ${state.selectedGrade === grade ? "is-active" : ""}" type="button" data-grade="${escapeHTML(grade)}"><span>${escapeHTML(grade)}</span>${renderGradeStatusBadge(grade)}</button>`)
    ].join("");
  }

  function renderMemberGrid() {
    const people = state.selectedGrade === "all" ? rawData.people : rawData.people.filter((person) => getPersonGrade(person) === state.selectedGrade);
    $("memberGrid").innerHTML = people.length
      ? people.map(renderMemberCard).join("")
      : '<div class="grade-empty">当前年级暂无成员信息。</div>';
  }

  function renderTeacherCard(teacher) {
    return `<article class="teacher-card"><img class="profile-avatar" src="${escapeHTML(teacher.avatar || fallbackAvatar(teacher.id, "dbeafe"))}" alt="${escapeHTML(teacher.name)}头像"><div><h3>${escapeHTML(teacher.name)}</h3><p class="teacher-title">${escapeHTML(teacher.title)}</p><p>${escapeHTML(teacher.group)}</p><p>${escapeHTML(teacher.bio)}</p><div class="card-actions">${renderEditActions("teacher", teacher.id)}</div></div></article>`;
  }

  function renderMemberCard(person) {
    return `<article class="member-card"><div class="member-top"><img class="profile-avatar" src="${escapeHTML(person.avatar || fallbackAvatar(person.id))}" alt="${escapeHTML(person.name)}头像"><div><h3>${escapeHTML(person.name)}</h3><p>${escapeHTML(getPersonGrade(person))} · ${renderBirthYearStatus(person)}</p><p>${escapeHTML(person.group)}</p></div></div><div class="tag-row">${(person.tags || []).slice(0, 3).map((tag) => `<span class="tag">${escapeHTML(tag)}</span>`).join("")}</div><p class="paper-summary">论文进度 ${(person.papers || []).length} 项</p><div class="card-actions"><button type="button" data-view-person="${escapeHTML(person.id)}">查看详情</button>${renderEditActions("person", person.id)}</div></article>`;
  }

  function getNodeStyle(model, focusedNodeId) {
    const baseColor = model.type === "person" ? palette.person : model.data?.members?.length > 1 ? palette.shared : palette[model.type];
    const isFocused = model.id === focusedNodeId;
    return { fill: baseColor, stroke: "#ffffff", lineWidth: isFocused ? 4 : 2, shadowColor: "rgba(31,111,139,.22)", shadowBlur: isFocused ? 26 : 12, opacity: 1, cursor: "pointer" };
  }

  function getNodeSize(model, focusedNodeId, neighborIds) {
    if (model.id === focusedNodeId) return 112;
    if (neighborIds.has(model.id)) return model.type === "person" ? 82 : 74;
    return model.type === "person" ? 64 : 58;
  }

  function getLabelStyle(model, focusedNodeId, neighborIds) {
    const isVisible = !focusedNodeId || model.id === focusedNodeId || neighborIds.has(model.id) || model.type === "person";
    return { fill: "#23313a", fontSize: model.id === focusedNodeId ? 16 : 12, fontWeight: 700, opacity: isVisible ? 1 : 0.28 };
  }

  function computeVisibleNodes(adjacency, focusedNodeId) {
    const visible = new Set();
    if (!focusedNodeId) return visible;
    visible.add(focusedNodeId);
    (adjacency.get(focusedNodeId) || new Set()).forEach((nodeId) => {
      visible.add(nodeId);
      (adjacency.get(nodeId) || new Set()).forEach((nextId) => visible.add(nextId));
    });
    return visible;
  }

  function positionRing(nodeIds, centerX, centerY, radius, startAngle, positions, yScale) {
    nodeIds.forEach((nodeId, index) => {
      const angle = startAngle + index * ((Math.PI * 2) / Math.max(nodeIds.length, 1));
      positions.set(nodeId, { x: centerX + radius * Math.cos(angle), y: centerY + radius * (yScale || 1) * Math.sin(angle) });
    });
  }

  function positionCluster(nodeIds, anchorX, anchorY, baseAngle, distance, spread, positions) {
    if (!nodeIds.length) return;
    if (nodeIds.length === 1) {
      positions.set(nodeIds[0], { x: anchorX + distance * Math.cos(baseAngle), y: anchorY + distance * Math.sin(baseAngle) });
      return;
    }
    const startAngle = baseAngle - spread / 2;
    const step = spread / Math.max(nodeIds.length - 1, 1);
    nodeIds.forEach((nodeId, index) => {
      const angle = startAngle + step * index;
      positions.set(nodeId, { x: anchorX + distance * Math.cos(angle), y: anchorY + distance * Math.sin(angle) });
    });
  }

  function computeLayout(graphStructure, width, height, focusedNodeId) {
    const positions = new Map();
    const centerX = width / 2;
    const centerY = height / 2;
    const peopleIds = rawData.people.map((person) => person.id);
    const allNodeIds = graphStructure.nodes.map((node) => node.id);
    if (!focusedNodeId) {
      positionRing(peopleIds, centerX, centerY, Math.min(width, height) * 0.34, -Math.PI / 2, positions, 0.86);
      positionRing(allNodeIds.filter((nodeId) => !peopleIds.includes(nodeId)), centerX, centerY, Math.min(width, height) * 0.18, -Math.PI / 2, positions, 0.76);
      return positions;
    }
    positions.set(focusedNodeId, { x: centerX, y: centerY });
    const firstHop = Array.from(graphStructure.adjacency.get(focusedNodeId) || []);
    const directAngles = new Map();
    const firstRingRadius = Math.min(width, height) * 0.2;
    const outerRadius = Math.min(width, height) * 0.47;
    firstHop.forEach((nodeId, index) => {
      const angle = -Math.PI / 2 + index * ((Math.PI * 2) / Math.max(firstHop.length, 1));
      directAngles.set(nodeId, angle);
      positions.set(nodeId, { x: centerX + firstRingRadius * Math.cos(angle), y: centerY + firstRingRadius * 0.86 * Math.sin(angle) });
    });
    const secondHopSet = new Set();
    firstHop.forEach((nodeId) => (graphStructure.adjacency.get(nodeId) || new Set()).forEach((nextId) => {
      if (nextId !== focusedNodeId && !firstHop.includes(nextId)) secondHopSet.add(nextId);
    }));
    const groupedSecondHop = new Map(firstHop.map((nodeId) => [nodeId, []]));
    Array.from(secondHopSet).forEach((nodeId) => {
      const ownerId = firstHop.find((firstId) => (graphStructure.adjacency.get(nodeId) || new Set()).has(firstId));
      if (ownerId) groupedSecondHop.get(ownerId).push(nodeId);
    });
    firstHop.forEach((nodeId) => {
      const anchor = positions.get(nodeId);
      const angle = directAngles.get(nodeId) || 0;
      positionCluster(groupedSecondHop.get(nodeId) || [], anchor.x, anchor.y, angle, Math.min(width, height) * 0.16, Math.PI / 1.8, positions);
    });
    const unrelated = allNodeIds.filter((nodeId) => nodeId !== focusedNodeId && !firstHop.includes(nodeId) && !secondHopSet.has(nodeId));
    positionRing(unrelated, centerX, centerY, outerRadius, -Math.PI / 2, positions, 0.9);
    return positions;
  }

  function renderPersonDetail(person) {
    detailTitle.textContent = person.name;
    detailSubtitle.textContent = `${person.role || "成员"} · ${person.group || "未填写方向组"}`;
    detailMeta.innerHTML = `<div class="meta-chip-row"><span class="chip">${escapeHTML(getPersonGrade(person))}</span><span class="chip">${renderBirthYearStatus(person)}</span><span class="chip">研究方向 ${(person.directions || []).length}</span><span class="chip">技术方法 ${(person.skills || []).length}</span><span class="chip">仪器设备 ${(person.equipment || []).length}</span><span class="chip">软件工具 ${(person.software || []).length}</span></div><div class="tag-row">${(person.tags || []).map((tag) => `<span class="tag">${escapeHTML(tag)}</span>`).join("")}</div>`;
    detailContent.innerHTML = `<img class="detail-avatar" src="${escapeHTML(person.avatar || fallbackAvatar(person.id))}" alt="${escapeHTML(person.name)}头像"><div class="detail-group"><h3>个人信息</h3>${renderDetailExtraButtons(person)}</div><button class="secondary-button" type="button" data-paper-id="${escapeHTML(person.id)}">添加论文进度</button><div class="detail-group"><h3>论文进度</h3>${renderPaperList(person)}</div><div class="detail-group"><h3>个人简介</h3><p>${escapeHTML(person.bio || "暂无简介。")}</p></div><div class="detail-group"><h3>研究方向</h3><ul>${(person.directions || []).map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul></div><div class="detail-group"><h3>技术方法分析</h3><ul>${(person.skills || []).map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul></div><div class="detail-group"><h3>仪器设备</h3><ul>${(person.equipment || []).map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul></div><div class="detail-group"><h3>软件工具</h3><ul>${(person.software || []).map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul></div>`;
  }

  function renderPaperList(person) {
    const papers = person.papers || [];
    if (!papers.length) return '<p class="empty-state">暂无论文进度。点击按钮可添加论文题目和当前进度。</p>';
    return `<ul class="paper-list">${papers.map((paper) => `<li><strong>${escapeHTML(paper.title)}</strong><span>${escapeHTML(paper.progress)}</span></li>`).join("")}</ul>`;
  }

  function renderAbilityDetail(model) {
    const memberNames = (model.data.members || []).map((personId) => peopleById.get(personId)?.name || personId);
    detailTitle.textContent = model.label;
    detailSubtitle.textContent = `${typeLabelMap[model.type]} · ${memberNames.length > 1 ? "共享节点" : "个人节点"}`;
    detailMeta.innerHTML = `<div class="meta-chip-row"><span class="chip">关联成员 ${memberNames.length}</span><span class="chip">${memberNames.length > 1 ? "多人共享" : "单人掌握"}</span></div>`;
    detailContent.innerHTML = `<div class="detail-group"><h3>关联成员</h3><ul>${memberNames.map((name) => `<li>${escapeHTML(name)}</li>`).join("")}</ul></div><div class="detail-group"><h3>节点说明</h3><p>该节点已与所有掌握这项能力的成员连接。点击后会把该节点移动到中心，并展开相关成员网络。</p></div>`;
  }

  function renderEmptyDetail(message) {
    detailTitle.textContent = "点击节点查看详情";
    detailSubtitle.textContent = message;
    detailMeta.innerHTML = "";
    detailContent.innerHTML = '<p class="empty-state">点击任意成员、设备或软件节点，节点会移动到中心并放大显示，同时展开相关关系。</p>';
  }

  function buildGraphData() {
    const size = getCanvasSize();
    const positions = computeLayout(structure, size.width, size.height, null);
    return {
      nodes: structure.nodes.map((node) => ({ ...node, x: positions.get(node.id)?.x || size.width / 2, y: positions.get(node.id)?.y || size.height / 2, size: node.type === "person" ? 64 : 58, style: getNodeStyle(node, null), labelCfg: { position: "center", style: getLabelStyle(node, null, new Set()) }, label: truncateLabel(node.shortLabel, node.type === "person" ? 4 : 8) })),
      edges: structure.edges.map((edge) => ({ ...edge, style: { stroke: palette.edge, lineWidth: 1.8, opacity: 0.08 } }))
    };
  }

  function initGraph() {
    rebuildRawData();
    structure = createGraphStructure(rawData);
    renderWebsiteSections();
    if (!window.G6) {
      graphContainer.innerHTML = '<div class="graph-error">图谱库加载失败，请检查网络后刷新页面。</div>';
      renderEmptyDetail("当前未选择任何节点");
      return;
    }
    const size = getCanvasSize();
    graph = new G6.Graph({ container: "graphContainer", width: size.width, height: size.height, animate: true, animateCfg: { duration: 500, easing: "easeCubic" }, modes: { default: ["drag-canvas", "zoom-canvas", "drag-node"] }, defaultNode: { type: "circle" }, defaultEdge: { style: { stroke: palette.edge, opacity: 0.08 } } });
    graph.data(buildGraphData());
    graph.render();
    graph.on("node:click", (event) => {
      const model = event.item.getModel();
      state.focusedNodeId = model.id;
      model.type === "person" ? renderPersonDetail(model.data) : renderAbilityDetail(model);
      applyGraphState();
    });
    graph.on("canvas:click", () => {
      state.focusedNodeId = null;
      renderEmptyDetail("当前未选择任何节点");
      applyGraphState();
    });
    renderEmptyDetail("当前未选择任何节点");
    applyGraphState();
  }

  function refreshGraph() {
    rebuildRawData();
    structure = createGraphStructure(rawData);
    renderWebsiteSections();
    if (!graph) return;
    state.focusedNodeId = null;
    graph.changeData(buildGraphData());
    renderEmptyDetail("信息已更新");
    applyGraphState();
  }

  function applyGraphState() {
    if (!graph) return;
    const { width, height } = getCanvasSize();
    const focusedNodeId = state.focusedNodeId;
    const visibleNodeIds = computeVisibleNodes(structure.adjacency, focusedNodeId);
    const positions = computeLayout(structure, width, height, focusedNodeId);
    const neighborIds = focusedNodeId ? new Set(structure.adjacency.get(focusedNodeId) || []) : new Set();
    const relatedIds = new Set(focusedNodeId ? [focusedNodeId, ...visibleNodeIds] : visibleNodeIds);
    const keyword = state.searchTerm.trim().toLowerCase();
    const typeValue = state.typeFilter;
    graph.getNodes().forEach((node) => {
      const model = node.getModel();
      const position = positions.get(model.id) || { x: width / 2, y: height / 2 };
      const matchesKeyword = !keyword || `${model.label} ${JSON.stringify(model.data || {})}`.toLowerCase().includes(keyword);
      const matchesType = typeValue === "all" || model.type === typeValue;
      const isRelated = !focusedNodeId || relatedIds.has(model.id);
      const visibleByGraph = focusedNodeId ? isRelated : true;
      const opacity = matchesKeyword && matchesType ? (isRelated || !focusedNodeId ? 1 : 0.42) : 0.12;
      graph.updateItem(node, { x: position.x, y: position.y, size: getNodeSize(model, focusedNodeId, neighborIds), label: truncateLabel(model.shortLabel || model.label, model.id === focusedNodeId ? 10 : model.type === "person" ? 4 : 8), style: { ...getNodeStyle(model, focusedNodeId), fill: isRelated ? getNodeStyle(model, focusedNodeId).fill : palette.mutedNode, opacity: visibleByGraph ? opacity : 0.42 }, labelCfg: { position: "center", style: { ...getLabelStyle(model, focusedNodeId, neighborIds), fill: isRelated ? "#23313a" : palette.mutedText, opacity: visibleByGraph ? 1 : 0.45 } } });
    });
    graph.getEdges().forEach((edge) => {
      const model = edge.getModel();
      const sourceNode = graph.findById(model.source);
      const targetNode = graph.findById(model.target);
      const matchesKeyword = !keyword || `${sourceNode?.getModel()?.label || ""} ${targetNode?.getModel()?.label || ""}`.toLowerCase().includes(keyword);
      const visibleByType = typeValue === "all" || sourceNode?.getModel()?.type === typeValue || targetNode?.getModel()?.type === typeValue;
      const sourceRelated = !focusedNodeId || relatedIds.has(model.source);
      const targetRelated = !focusedNodeId || relatedIds.has(model.target);
      const highlighted = focusedNodeId && sourceRelated && targetRelated && (model.source === focusedNodeId || model.target === focusedNodeId || (neighborIds.has(model.source) && neighborIds.has(model.target)));
      const visibleByGraph = focusedNodeId ? sourceRelated && targetRelated : true;
      graph.updateItem(edge, { style: { stroke: highlighted ? palette.edgeHighlight : sourceRelated && targetRelated ? palette.edge : "#dfe6ea", lineWidth: highlighted ? 2.8 : 1.8, opacity: matchesKeyword && visibleByType ? (visibleByGraph ? (highlighted ? 0.95 : 0.28) : 0.04) : 0.02 } });
    });
  }

  function openForm(type, record) {
    currentFormType = type;
    editContext = record ? { type, id: record.id } : null;
    const titleMap = { teacher: "修改老师信息", person: "添加人物信息", equipment: "添加仪器设备", software: "添加软件工具", paper: "添加论文进度" };
    dialogTitle.textContent = type === "paper" ? `添加${record?.name || ""}的论文进度` : record ? `修改${type === "teacher" ? "老师" : "成员"}信息` : titleMap[type];
    formFields.innerHTML = getFormHTML(type, record);
    infoDialog.showModal();
  }

  function getFormHTML(type, record) {
    if (type === "paper") {
      return `<label class="field wide-field"><span>论文题目</span><input name="paperTitle" required placeholder="请输入论文名称"></label><label class="field wide-field"><span>论文进度</span><textarea name="paperProgress" rows="3" required placeholder="例如：已完成初稿 / 数据分析中 / 等待投稿 / 已录用"></textarea></label>`;
    }
    if (type === "teacher") {
      return `<label class="field"><span>姓名</span><input name="name" required value="${escapeHTML(record?.name || "")}"></label><label class="field"><span>职务</span><input name="title" value="${escapeHTML(record?.title || "")}"></label><label class="field wide-field"><span>研究方向</span><input name="group" value="${escapeHTML(record?.group || "")}"></label><label class="field wide-field"><span>个人介绍</span><textarea name="bio" rows="3">${escapeHTML(record?.bio || "")}</textarea></label><label class="field wide-field"><span>头像图片地址</span><input name="avatar" value="${escapeHTML(record?.avatar || "")}"></label>`;
    }
    if (type === "person") {
      const status = getGraduationStatus(record || {});
      return `<label class="field"><span>姓名</span><input name="name" required value="${escapeHTML(record?.name || "")}"></label><label class="field"><span>身份</span><input name="role" value="${escapeHTML(record?.role || "科研组成员")}"></label><label class="field"><span>年级</span><input name="grade" placeholder="例如：2023级 / 研二" value="${escapeHTML(getPersonGrade(record || {}))}"></label><label class="field"><span>出生年份</span><input name="birthYear" type="number" min="1900" max="2099" placeholder="例如：2003" value="${escapeHTML(getBirthYear(record || {}) === "出生年份待补充" ? "" : getBirthYear(record || {}))}"></label><label class="field"><span>毕业状态</span><select name="graduationStatus"><option value="未毕业" ${status === "未毕业" ? "selected" : ""}>未毕业</option><option value="已毕业" ${status === "已毕业" ? "selected" : ""}>已毕业</option></select></label><label class="field wide-field"><span>研究方向组</span><input name="group" required value="${escapeHTML(record?.group || "")}"></label><label class="field wide-field"><span>个人介绍</span><textarea name="bio" rows="3">${escapeHTML(record?.bio || "")}</textarea></label><label class="field"><span>邮箱</span><input name="email" type="email" value="${escapeHTML(record?.email || "")}"></label><label class="field"><span>微信号</span><input name="wechat" value="${escapeHTML(record?.wechat || "")}"></label><label class="field"><span>手机号</span><input name="phone" value="${escapeHTML(record?.phone || "")}"></label><label class="field"><span>个人爱好</span><input name="hobbies" placeholder="用逗号分隔" value="${escapeHTML(joinList(record?.hobbies))}"></label><label class="field"><span>工作去向</span><input name="career" value="${escapeHTML(record?.career || "")}"></label><label class="field"><span>科研成果</span><input name="achievements" placeholder="用逗号分隔" value="${escapeHTML(joinList(record?.achievements))}"></label><label class="field"><span>标签</span><input name="tags" placeholder="用逗号分隔" value="${escapeHTML(joinList(record?.tags))}"></label><label class="field"><span>研究方向</span><input name="directions" placeholder="用逗号分隔" value="${escapeHTML(joinList(record?.directions))}"></label><label class="field"><span>仪器设备</span><input name="equipment" placeholder="用逗号分隔" value="${escapeHTML(joinList(record?.equipment))}"></label><label class="field"><span>软件工具</span><input name="software" placeholder="用逗号分隔" value="${escapeHTML(joinList(record?.software))}"></label><label class="field wide-field"><span>头像图片地址</span><input name="avatar" placeholder="可留空，系统生成卡通头像" value="${escapeHTML(record?.avatar || "")}"></label>`;
    }
    const label = type === "equipment" ? "仪器设备名称" : "软件工具名称";
    return `<label class="field"><span>${label}</span><input name="name" required></label><label class="field"><span>关联成员</span><input name="owner" placeholder="例如：公共资源"></label><label class="field wide-field"><span>说明</span><textarea name="bio" rows="3" placeholder="补充用途、型号或软件功能"></textarea></label>`;
  }

  function handleFormSubmit(event) {
    event.preventDefault();
    const formData = new FormData(infoForm);
    const name = String(formData.get("name") || "").trim();
    if (currentFormType !== "paper" && !name) return;
    if (currentFormType === "teacher") {
      const record = {
        id: editContext?.id || `teacher-custom-${Date.now()}`,
        name,
        title: String(formData.get("title") || "指导老师").trim(),
        group: String(formData.get("group") || "未填写方向").trim(),
        bio: String(formData.get("bio") || "暂无简介。").trim(),
        avatar: String(formData.get("avatar") || "").trim() || fallbackAvatar(name, "dbeafe")
      };
      upsertUserRecord("teacher", record);
    } else if (currentFormType === "paper") {
      const person = rawData.people.find((item) => item.id === editContext?.id);
      if (!person) return;
      const updated = {
        ...person,
        papers: [
          ...(person.papers || []),
          {
            id: `paper-${Date.now()}`,
            title: String(formData.get("paperTitle") || "").trim(),
            progress: String(formData.get("paperProgress") || "").trim()
          }
        ]
      };
      upsertUserRecord("person", updated);
    } else if (currentFormType === "person") {
      const existing = editContext ? rawData.people.find((person) => person.id === editContext.id) : null;
      const record = {
        id: editContext?.id || `person-custom-${Date.now()}`,
        name,
        role: String(formData.get("role") || "科研组成员").trim(),
        grade: String(formData.get("grade") || "未分年级").trim(),
        birthYear: String(formData.get("birthYear") || "").trim(),
        graduationStatus: String(formData.get("graduationStatus") || defaultProfiles[editContext?.id]?.graduationStatus || "未毕业").trim(),
        group: String(formData.get("group") || "未填写方向组").trim(),
        bio: String(formData.get("bio") || "暂无简介。").trim(),
        avatar: String(formData.get("avatar") || "").trim() || fallbackAvatar(name, "e0f2fe"),
        email: String(formData.get("email") || "").trim(),
        wechat: String(formData.get("wechat") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        hobbies: splitList(formData.get("hobbies")),
        career: String(formData.get("career") || "").trim(),
        achievements: splitList(formData.get("achievements")),
        tags: splitList(formData.get("tags")),
        directions: splitList(formData.get("directions")),
        skills: existing?.skills || ["页面新增信息"],
        equipment: splitList(formData.get("equipment")),
        software: splitList(formData.get("software")),
        papers: existing?.papers || []
      };
      upsertUserRecord("person", record);
      state.selectedGrade = record.grade || "未分年级";
    } else {
      const owner = String(formData.get("owner") || "公共资源").trim();
      const resourcePerson = {
        id: `resource-${currentFormType}-${Date.now()}`,
        name: owner,
        role: "资源维护",
        grade: "资源",
        birthYear: "",
        graduationStatus: "未毕业",
        group: currentFormType === "equipment" ? "新增仪器设备" : "新增软件工具",
        bio: String(formData.get("bio") || `${owner} 关联的${typeLabelMap[currentFormType]}。`).trim(),
        avatar: fallbackAvatar(`${currentFormType}-${name}`, currentFormType === "equipment" ? "dbeafe" : "ede9fe"),
        tags: [typeLabelMap[currentFormType], "页面新增"],
        directions: ["页面新增资源"],
        skills: ["页面新增信息"],
        equipment: currentFormType === "equipment" ? [name] : [],
        software: currentFormType === "software" ? [name] : []
      };
      userData.resourcePeople.push(resourcePerson);
    }
    saveUserData();
    infoDialog.close();
    infoForm.reset();
    editContext = null;
    refreshGraph();
  }

  function updateAvatar(kind, id, dataUrl) {
    const collection = kind === "teacher" ? rawData.teachers : rawData.people;
    const target = collection.find((item) => item.id === id);
    if (!target) return;
    target.avatar = dataUrl;
    upsertUserRecord(kind, { ...target });
    saveUserData();
    refreshGraph();
  }

  document.addEventListener("click", (event) => {
    const gradeButton = event.target.closest("[data-grade]");
    if (gradeButton) {
      state.selectedGrade = gradeButton.dataset.grade;
      renderGradeControls();
      renderMemberGrid();
    }
    const detailButton = event.target.closest("[data-detail-extra]");
    if (detailButton) {
      const panel = $("detailExtraPanel");
      const person = rawData.people.find((item) => item.id === state.focusedNodeId);
      if (panel && person) {
        const selected = getPersonExtraItems(person).find(([key]) => key === detailButton.dataset.detailExtra);
        if (selected) {
          document.querySelectorAll(".detail-toggle").forEach((button) => button.classList.toggle("is-open", button === detailButton));
          panel.innerHTML = `<strong>${escapeHTML(selected[1])}</strong>${renderValue(selected[2])}`;
        }
      }
    }
    const viewButton = event.target.closest("[data-view-person]");
    if (viewButton) {
      const person = rawData.people.find((item) => item.id === viewButton.dataset.viewPerson);
      if (person) {
        state.focusedNodeId = person.id;
        renderPersonDetail(person);
        renderFullPersonDialog(person);
        applyGraphState();
      }
    }
    const formButton = event.target.closest("[data-open-form]");
    if (formButton) {
      if (!requireEditPermission()) return;
      openForm(formButton.dataset.openForm);
    }
    const editButton = event.target.closest("[data-edit-kind]");
    if (editButton) {
      if (!requireEditPermission()) return;
      const kind = editButton.dataset.editKind;
      const id = editButton.dataset.editId;
      const record = kind === "teacher" ? rawData.teachers.find((item) => item.id === id) : rawData.people.find((item) => item.id === id);
      if (record) openForm(kind, record);
    }
    const paperButton = event.target.closest("[data-paper-id]");
    if (paperButton) {
      if (!requireEditPermission()) return;
      const person = rawData.people.find((item) => item.id === paperButton.dataset.paperId);
      if (person) openForm("paper", person);
    }
    const deleteButton = event.target.closest("[data-delete-kind]");
    if (deleteButton) {
      if (!requireEditPermission()) return;
      const kind = deleteButton.dataset.deleteKind;
      const id = deleteButton.dataset.deleteId;
      const record = kind === "teacher" ? rawData.teachers.find((item) => item.id === id) : rawData.people.find((item) => item.id === id);
      if (record && window.confirm(`确定删除“${record.name}”吗？`)) deleteRecord(kind, id);
    }
    const avatarButton = event.target.closest("[data-avatar-id]");
    if (avatarButton) {
      if (!requireEditPermission()) return;
      avatarContext = { kind: avatarButton.dataset.avatarKind, id: avatarButton.dataset.avatarId };
      avatarFileInput.click();
    }
  });

  infoForm.addEventListener("submit", handleFormSubmit);
  $("closeDialog").addEventListener("click", () => infoDialog.close());
  $("cancelDialog").addEventListener("click", () => infoDialog.close());
  $("closePersonDialog").addEventListener("click", () => personDialog.close());
  personDialog.addEventListener("click", (event) => {
    if (event.target === personDialog) personDialog.close();
  });
  operatorLogin.addEventListener("click", () => {
    if (operatorPasswordInput.value === operatorPassword) {
      sessionStorage.setItem(operatorSessionKey, "true");
      operatorPasswordInput.value = "";
      renderWebsiteSections();
    } else {
      window.alert("密码不正确。");
    }
  });
  operatorPasswordInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") operatorLogin.click();
  });
  operatorLogout.addEventListener("click", () => {
    sessionStorage.removeItem(operatorSessionKey);
    renderWebsiteSections();
  });
  togglePublicEdit.addEventListener("click", () => {
    if (!isOperator()) return;
    userData.permissions = { ...(userData.permissions || {}), publicEdit: !userData.permissions?.publicEdit };
    saveUserData();
    renderWebsiteSections();
  });
  $("clearLocalData").addEventListener("click", async () => {
    if (!requireEditPermission()) return;
    Object.assign(userData, defaultUserData());
    await saveCloudData();
    localStorage.removeItem(storageKey);
    localStorage.removeItem(oldStorageKey);
    location.reload();
  });
  avatarFileInput.addEventListener("change", () => {
    const file = avatarFileInput.files[0];
    if (!file || !avatarContext) return;
    const reader = new FileReader();
    reader.onload = () => updateAvatar(avatarContext.kind, avatarContext.id, reader.result);
    reader.readAsDataURL(file);
    avatarFileInput.value = "";
  });
  searchInput.addEventListener("input", (event) => { state.searchTerm = event.target.value; applyGraphState(); });
  typeFilter.addEventListener("change", (event) => { state.typeFilter = event.target.value; applyGraphState(); });
  resetButton.addEventListener("click", () => { state.focusedNodeId = null; state.searchTerm = ""; state.typeFilter = "all"; searchInput.value = ""; typeFilter.value = "all"; renderEmptyDetail("视图已重置"); applyGraphState(); });
  window.addEventListener("resize", () => { if (!graph) return; const { width, height } = getCanvasSize(); graph.changeSize(width, height); applyGraphState(); });

  async function boot() {
    await loadCloudData();
    initGraph();
  }

  boot();
})();
