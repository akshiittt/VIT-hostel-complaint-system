var complaints = [];

var mensBlocks = ["A","B","C","D","E","F","G","H","J","K","L","M","N","P","Q","R","S","T"];
var womensBlocks = ["A","B","C","D","E","F","G","H","J"];

function initLogin() {
    var studentBtn = document.getElementById("studentBtn");
    var wardenBtn = document.getElementById("wardenBtn");

    if (!studentBtn) return;

    studentBtn.addEventListener("click", function() {
        var name = document.getElementById("loginName").value.trim();
        var id = document.getElementById("loginId").value.trim();
        var errorEl = document.getElementById("loginError");

        if (name === "" || id === "") {
            errorEl.style.display = "block";
            return;
        }
        errorEl.style.display = "none";
        window.location.href = "student.html";
    });

    wardenBtn.addEventListener("click", function() {
        var name = document.getElementById("loginName").value.trim();
        var id = document.getElementById("loginId").value.trim();
        var errorEl = document.getElementById("loginError");

        if (name === "" || id === "") {
            errorEl.style.display = "block";
            return;
        }
        errorEl.style.display = "none";
        window.location.href = "warden.html";
    });
}

function populateBlocks(blocks) {
    var blockSelect = document.getElementById("hostelBlock");
    blockSelect.innerHTML = '<option value="">-- Select Block --</option>';
    for (var i = 0; i < blocks.length; i++) {
        var opt = document.createElement("option");
        opt.value = blocks[i];
        opt.textContent = "Block " + blocks[i];
        blockSelect.appendChild(opt);
    }
}

function getSelectedComplaintType() {
    var radios = document.getElementsByName("complaintType");
    for (var i = 0; i < radios.length; i++) {
        if (radios[i].checked) {
            return radios[i].value;
        }
    }
    return "";
}

function renderComplaints(list) {
    var container = document.getElementById("complaintList");
    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = '<p class="empty-msg">No complaints found.</p>';
        return;
    }

    container.innerHTML = "";
    for (var i = 0; i < list.length; i++) {
        var c = list[i];
        var statusClass = c.status === "Completed" ? "badge-status-completed" : "badge-status-pending";
        var urgentBadge = c.urgent ? '<span class="badge badge-urgent">Urgent</span>' : "";
        var urgentClass = c.urgent ? "urgent" : "";

        var card = document.createElement("div");
        card.className = "complaint-card " + urgentClass;
        card.innerHTML =
            '<div class="card-top">' +
                '<div>' +
                    '<span class="card-name">' + c.name + '</span>' +
                    '<span class="card-reg">' + c.reg + '</span>' +
                '</div>' +
                '<div class="card-badges">' +
                    '<span class="badge badge-type">' + c.type + '</span>' +
                    urgentBadge +
                    '<span class="badge ' + statusClass + '">' + c.status + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="card-hostel">' + c.hostelType + ' &nbsp;|&nbsp; Block ' + c.block + ' &nbsp;|&nbsp; Room ' + c.room + '</div>' +
            '<div class="card-desc">' + c.description + '</div>';

        container.appendChild(card);
    }
}

function renderWardenComplaints() {
    var container = document.getElementById("wardenComplaintList");
    if (!container) return;

    document.getElementById("totalCount").textContent = complaints.length;

    var pendingCount = 0;
    var doneCount = 0;
    for (var i = 0; i < complaints.length; i++) {
        if (complaints[i].status === "Pending") {
            pendingCount++;
        } else {
            doneCount++;
        }
    }
    document.getElementById("pendingCount").textContent = pendingCount;
    document.getElementById("doneCount").textContent = doneCount;

    if (complaints.length === 0) {
        container.innerHTML = '<p class="empty-msg">No complaints found. Students haven\'t submitted any yet.</p>';
        return;
    }

    container.innerHTML = "";
    for (var j = 0; j < complaints.length; j++) {
        var c = complaints[j];
        var statusClass = c.status === "Completed" ? "badge-status-completed" : "badge-status-pending";
        var urgentBadge = c.urgent ? '<span class="badge badge-urgent">Urgent</span>' : "";
        var urgentClass = c.urgent ? "urgent" : "";

        var card = document.createElement("div");
        card.className = "complaint-card " + urgentClass;
        card.setAttribute("data-index", j);

        card.innerHTML =
            '<div class="card-top">' +
                '<div>' +
                    '<span class="card-name">' + c.name + '</span>' +
                    '<span class="card-reg">' + c.reg + '</span>' +
                '</div>' +
                '<div class="card-badges">' +
                    '<span class="badge badge-type">' + c.type + '</span>' +
                    urgentBadge +
                    '<span class="badge ' + statusClass + '" id="status-badge-' + j + '">' + c.status + '</span>' +
                '</div>' +
            '</div>' +
            '<div class="card-hostel">' + c.hostelType + ' &nbsp;|&nbsp; Block ' + c.block + ' &nbsp;|&nbsp; Room ' + c.room + '</div>' +
            '<div class="card-desc">' + c.description + '</div>' +
            '<div class="card-actions">' +
                '<button class="btn-complete" data-index="' + j + '">Mark as Completed</button>' +
                '<button class="btn-pending" data-index="' + j + '">Mark as Pending</button>' +
            '</div>';

        container.appendChild(card);
    }

    var completeButtons = document.getElementsByClassName("btn-complete");
    for (var k = 0; k < completeButtons.length; k++) {
        completeButtons[k].addEventListener("click", function() {
            var idx = parseInt(this.getAttribute("data-index"));
            complaints[idx].status = "Completed";
            renderWardenComplaints();
        });
    }

    var pendingButtons = document.getElementsByClassName("btn-pending");
    for (var m = 0; m < pendingButtons.length; m++) {
        pendingButtons[m].addEventListener("click", function() {
            var idx = parseInt(this.getAttribute("data-index"));
            complaints[idx].status = "Pending";
            renderWardenComplaints();
        });
    }
}

function initStudent() {
    var hostelTypeSelect = document.getElementById("hostelType");
    if (!hostelTypeSelect) return;

    hostelTypeSelect.addEventListener("change", function() {
        var val = this.value;
        if (val === "mens") {
            populateBlocks(mensBlocks);
        } else if (val === "womens") {
            populateBlocks(womensBlocks);
        } else {
            document.getElementById("hostelBlock").innerHTML = '<option value="">-- Select Block --</option>';
        }
    });

    var form = document.getElementById("complaintForm");
    form.addEventListener("submit", function(e) {
        e.preventDefault();

        var name = document.getElementById("stuName").value.trim();
        var reg = document.getElementById("stuReg").value.trim();
        var hostelType = document.getElementById("hostelType").value;
        var block = document.getElementById("hostelBlock").value;
        var room = document.getElementById("roomNo").value.trim();
        var type = getSelectedComplaintType();
        var desc = document.getElementById("description").value.trim();
        var urgent = document.getElementById("isUrgent").checked;
        var errorEl = document.getElementById("formError");

        if (name === "" || reg === "" || hostelType === "" || block === "" || room === "" || type === "" || desc === "") {
            errorEl.style.display = "block";
            return;
        }
        errorEl.style.display = "none";

        var hostelLabel = hostelType === "mens" ? "Men's Hostel" : "Women's Hostel";

        var newComplaint = {
            name: name,
            reg: reg,
            hostelType: hostelLabel,
            block: block,
            room: room,
            type: type,
            description: desc,
            urgent: urgent,
            status: "Pending"
        };

        complaints.push(newComplaint);

        form.reset();
        document.getElementById("hostelBlock").innerHTML = '<option value="">-- Select Block --</option>';

        var filterVal = document.getElementById("filterType").value;
        applyFilter(filterVal);
    });

    var filterSelect = document.getElementById("filterType");
    filterSelect.addEventListener("change", function() {
        applyFilter(this.value);
    });
}

function applyFilter(filterVal) {
    if (filterVal === "All") {
        renderComplaints(complaints);
    } else {
        var filtered = [];
        for (var i = 0; i < complaints.length; i++) {
            if (complaints[i].type === filterVal) {
                filtered.push(complaints[i]);
            }
        }
        renderComplaints(filtered);
    }
}

function initWarden() {
    var container = document.getElementById("wardenComplaintList");
    if (!container) return;
    renderWardenComplaints();
}

window.onload = function() {
    initLogin();
    initStudent();
    initWarden();
};
