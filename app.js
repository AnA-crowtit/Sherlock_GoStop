import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, onSnapshot, doc, deleteDoc, runTransaction, query, where, getDocs, orderBy } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// 🌐 인터넷 실시간 환율 변수
let exchangeRate = 1400; 
let currentPlayersArray = []; 

// 🔥 [필수 변경] 위 1번 단계에서 복사한 본인의 파이어베이스 키값들을 여기에 꼭 넣어주세요!
const firebaseConfig = {
  apiKey: "AIzaSyBJtR_a23qFwSqrosO8UEUVV0huYWlJeiE",
  authDomain: "sherlock-gostop.firebaseapp.com",
  projectId: "sherlock-gostop",
  storageBucket: "sherlock-gostop.firebasestorage.app",
  messagingSenderId: "534712745185",
  appId: "1:534712745185:web:ef742a9109cb1b5b44cba0"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 전역 상태 변수
let playersData = {}; 
let isAdmin = false;
let unsubscribePending = null;
const ADMIN_PASSWORD = "mj050709!"; // 🛡️ 동아리 관리자 비밀번호

// --- 0. 인터넷에서 실시간 달러 환율 자동으로 따오기 ---
async function fetchRealtimeExchangeRate() {
    try {
        const response = await fetch("https://open.er-api.com/v6/latest/USD");
        const data = await response.json();
        if (data && data.rates && data.rates.KRW) {
            exchangeRate = data.rates.KRW;
            console.log(`🌐 인터넷 실시간 환율 반영 완료: 1달러 = ${exchangeRate.toFixed(1)}원`);
            renderPlayersUI();
        }
    } catch (err) {
        console.error("환율 정보를 가져오는데 실패하여 기본 환율(1400원)을 사용합니다.", err);
    }
}

// --- 1. 실시간 플레이어 데이터 구독 및 UI 동기화 ---
onSnapshot(collection(db, "players"), (snapshot) => {
    currentPlayersArray = [];
    snapshot.forEach((doc) => {
        currentPlayersArray.push({ id: doc.id, ...doc.data() });
    });
    renderPlayersUI();
});

function renderPlayersUI() {
    const playerListDiv = document.getElementById("playerList");
    const adminPlayerList = document.getElementById("adminPlayerList");
    const checkboxContainer = document.getElementById("participantCheckboxes");
    
    if (!playerListDiv || !adminPlayerList || !checkboxContainer) return;

    playerListDiv.innerHTML = "";
    adminPlayerList.innerHTML = "";
    checkboxContainer.innerHTML = "";
    playersData = {};

    // 보유 자산 기준 내림차순 정렬
    currentPlayersArray.sort((a, b) => b.total_money - a.total_money);

    currentPlayersArray.forEach((player) => {
        playersData[player.id] = player;
        const krwMoney = Math.floor(player.total_money * exchangeRate).toLocaleString('ko-KR');

        // 메인 화면 출력
        const row = document.createElement("div");
        row.className = "flex justify-between items-center p-3 bg-gray-50 rounded-lg border border-gray-200/60";
        row.innerHTML = `
            <span class="font-medium text-gray-700">${player.name}</span>
            <div class="text-right">
                <span class="${player.total_money >= 0 ? 'text-blue-600' : 'text-red-500'} font-bold">${player.total_money}$</span>
                <span class="text-xs text-gray-500 block">(약 ${krwMoney}원)</span>
            </div>
        `;
        playerListDiv.appendChild(row);

        // 체크박스 생성
        const cbLabel = document.createElement("label");
        cbLabel.className = "flex items-center gap-2 p-1.5 text-sm cursor-pointer hover:bg-gray-100 rounded transition";
        cbLabel.innerHTML = `<input type="checkbox" name="participants" value="${player.id}" onchange="updateBankruptSelect()" class="w-4 h-4 rounded text-blue-600 border-gray-300 focus:ring-blue-500">
                             <span class="text-gray-700 select-none">${player.name}</span>`;
        checkboxContainer.appendChild(cbLabel);

        // 관리자용 목록 생성
        const adminRow = document.createElement("div");
        adminRow.className = "flex justify-between items-center p-2 border-b last:border-0 text-xs text-gray-600 hover:bg-gray-100/50 rounded";
        adminRow.innerHTML = `<span class="font-medium text-gray-700">${player.name} (${player.total_money}$ / 약 ${krwMoney}원)</span>
                              <button onclick="deletePlayer('${player.id}', '${player.name}')" class="text-red-500 hover:text-red-700 font-semibold hover:underline">삭제</button>`;
        adminPlayerList.appendChild(adminRow);
    });
}

// --- 2. 체크박스 변경 시 파산자 셀렉트 박스 필터링 ---
window.updateBankruptSelect = () => {
    const checkedBoxes = document.querySelectorAll('input[name="participants"]:checked');
    const select = document.getElementById("bankruptSelect");
    const currentVal = select.value;
    
    select.innerHTML = '<option value="">-- 파산한 사람 선택 --</option>';
    checkedBoxes.forEach(cb => {
        const pId = cb.value;
        const option = document.createElement("option");
        option.value = pId;
        option.text = playersData[pId].name;
        select.appendChild(option);
    });
    select.value = currentVal;
};

// --- 3. 플레이어 추가 및 삭제 ---
window.addPlayer = async () => {
    const nameInput = document.getElementById("newPlayerName");
    const name = nameInput.value.trim();
    if (!name) return alert("플레이어 이름을 입력하세요.");
    
    try {
        await addDoc(collection(db, "players"), { name, total_money: 0 });
        nameInput.value = "";
    } catch (err) {
        console.error(err);
        alert("플레이어 추가 중 오류가 발생했습니다.");
    }
};

window.deletePlayer = async (id, name) => {
    if (confirm(`${name} 플레이어를 영구 삭제하시겠습니까?\n(해당 인원의 정산금 누적 데이터가 모두 삭제됩니다)`)) {
        await deleteDoc(doc(db, "players", id));
    }
};

// --- 4. 이번 판 기록 신청 ---
window.submitRound = async (e) => {
    e.preventDefault();
    const checkedBoxes = document.querySelectorAll('input[name="participants"]:checked');
    const bankruptPlayerId = document.getElementById("bankruptSelect").value;

    if (checkedBoxes.length < 2) return alert("최소 2명 이상의 플레이어를 선택해야 정산이 가능합니다.");
    if (!bankruptPlayerId) return alert("파산(독박)한 플레이어를 선택해 주세요.");

    const participantIds = Array.from(checkedBoxes).map(cb => cb.value);

    try {
        await addDoc(collection(db, "settlements"), {
            participant_ids: participantIds,
            bankrupt_player_id: bankruptPlayerId,
            status: "pending",
            created_at: new Date()
        });
        
        // 💬 [요청 반영] 정산 알림 문구 수정 완료!
        alert("정산 신청이 완료되었습니다!");
        
        document.getElementById("roundForm").reset();
        document.getElementById("bankruptSelect").innerHTML = '<option value="">-- 파산한 사람 선택 --</option>';
    } catch (err) {
        console.error(err);
        alert("기록 신청에 실패했습니다.");
    }
};

// --- 5. 관리자 모드 토글 및 인증 ---
window.toggleAdminMode = () => {
    if (!isAdmin) {
        const pw = prompt("관리자 인증 비밀번호를 입력하세요:");
        if (pw === ADMIN_PASSWORD) {
            isAdmin = true;
            document.getElementById("adminToggleBtn").innerText = "로그아웃";
            document.getElementById("adminSection").classList.remove("hidden");
            listenPendingSettlements();
        } else {
            alert("비밀번호가 올바르지 않습니다.");
        }
    } else {
        isAdmin = false;
        document.getElementById("adminToggleBtn").innerText = "관리자 로그인";
        document.getElementById("adminSection").classList.add("hidden");
        if (unsubscribePending) unsubscribePending();
    }
};

// --- 6. 대기 중인 정산 신청 모니터링 ---
function listenPendingSettlements() {
    const q = query(collection(db, "settlements"), where("status", "==", "pending"), orderBy("created_at", "desc"));
    unsubscribePending = onSnapshot(q, (snapshot) => {
        const pendingListDiv = document.getElementById("pendingList");
        pendingListDiv.innerHTML = "";

        if (snapshot.empty) {
            pendingListDiv.innerHTML = "<p class='text-gray-400 italic text-center py-4 text-xs'>현재 승인 대기 중인 정산 건이 없습니다.</p>";
            return;
        }

        snapshot.forEach((docSnap) => {
            const settle = docSnap.data();
            const bName = playersData[settle.bankrupt_player_id]?.name || "탈퇴 멤버";
            const pCount = settle.participant_ids?.length || 0;

            const div = document.createElement("div");
            div.className = "flex justify-between items-center bg-red-50 p-2.5 rounded-lg border border-red-200 text-xs";
            div.innerHTML = `
                <div>💥 <b>${bName}</b> 파산 (참가: ${pCount}명)</div>
                <div class="space-x-1 flex shadow-sm">
                    <button onclick="approveRound('${docSnap.id}')" class="bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded font-bold transition">승인</button>
                    <button onclick="rejectRound('${docSnap.id}')" class="bg-gray-400 hover:bg-gray-500 text-white px-2.5 py-1 rounded transition">거절</button>
                </div>
            `;
            pendingListDiv.appendChild(div);
        });
    });
}

window.rejectRound = async (id) => {
    if (confirm("이 정산 신청 기록을 거절하고 삭제하시겠습니까?")) {
        await deleteDoc(doc(db, "settlements", id));
    }
};

// --- 7. 정산 승인 및 트랜잭션 연산 ---
window.approveRound = async (settlementId) => {
    if (!confirm("정산을 승인하시겠습니까?\n이 작업은 즉시 부원들의 자산 잔고를 변경합니다.")) return;

    try {
        await runTransaction(db, async (transaction) => {
            const settleRef = doc(db, "settlements", settlementId);
            const settleSnap = await transaction.get(settleRef);
            
            if (!settleSnap.exists() || settleSnap.data().status !== "pending") return;

            const { participant_ids, bankrupt_player_id } = settleSnap.data();
            const N = participant_ids.length; 
            const loss = (N - 1) * 2; 

            const playerSnaps = [];
            for (const pId of participant_ids) {
                const pRef = doc(db, "players", pId);
                const pSnap = await transaction.get(pRef);
                playerSnaps.push({ ref: pRef, snap: pSnap, id: pId });
            }

            transaction.update(settleRef, { status: "approved" });

            for (const p of playerSnaps) {
                const currentMoney = p.snap.data().total_money || 0;
                if (p.id === bankrupt_player_id) {
                    transaction.update(p.ref, { total_money: currentMoney - loss }); 
                } else {
                    transaction.update(p.ref, { total_money: currentMoney + 2 }); 
                }
            }
        });

        alert("성공적으로 정산 처리되었습니다!");
        loadHistory(); 
    } catch (err) {
        console.error(err);
        alert("안전 정산 연산(Transaction)에 실패했습니다.");
    }
};

// --- 8. 월별 기록실 조회 ---
function initMonthFilter() {
    const select = document.getElementById("monthFilter");
    const now = new Date();
    select.innerHTML = "";
    
    for (let i = 0; i < 6; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const value = `${year}-${month}`;
        
        const opt = document.createElement("option");
        opt.value = value;
        opt.text = `${year}년 ${month}월`;
        select.appendChild(opt);
    }
}

window.loadHistory = async () => {
    const selectedMonth = document.getElementById("monthFilter").value;
    const [year, month] = selectedMonth.split("-").map(Number);
    
    const startOfFilter = new Date(year, month - 1, 1);
    const endOfFilter = new Date(year, month, 1);

    const q = query(
        collection(db, "settlements"), 
        where("status", "==", "approved"),
        where("created_at", ">=", startOfFilter),
        where("created_at", "<", endOfFilter),
        orderBy("created_at", "desc")
    );

    const querySnapshot = await getDocs(q);
    const tbody = document.getElementById("historyTableBody");
    tbody.innerHTML = "";

    if (querySnapshot.empty) {
        tbody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-gray-400 italic">해당 월의 승인 완료된 정산 내역이 없습니다.</td></tr>`;
        return;
    }

    querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const dateStr = data.created_at ? data.created_at.toDate().toLocaleString('ko-KR', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : "-";
        
        const pNames = data.participant_ids?.map(id => playersData[id]?.name || "탈퇴 멤버").join(", ") || "-";
        const bName = playersData[data.bankrupt_player_id]?.name || "탈퇴 멤버";

        const tr = document.createElement("tr");
        tr.className = "hover:bg-gray-50/70 transition text-gray-700";
        tr.innerHTML = `
            <td class="p-3 text-xs text-gray-500 font-mono">${dateStr}</td>
            <td class="p-3 font-medium">${pNames}</td>
            <td class="p-3 text-red-600 font-bold">${bName}</td>
        `;
        tbody.appendChild(tr);
    });
};

initMonthFilter();
fetchRealtimeExchangeRate(); 
setTimeout(() => { loadHistory(); }, 1200);