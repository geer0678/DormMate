const cloudApp = window.cloudbase && cloudbase.init({ env: 'cloudbase-d6g6fprx873111e6a' });
let cloudAuthPromise = null;

async function ensureCloudAuth() {
    if (!cloudApp) throw new Error('CloudBase SDK 未加载');
    if (!cloudAuthPromise) {
        cloudAuthPromise = (async () => {
            if (typeof cloudApp.auth !== 'function') throw new Error('CloudBase Auth 模块不可用');
            const auth = cloudApp.auth();
            await auth.signInAnonymously();
            const scope = await auth.loginScope();
            if (scope !== 'anonymous') throw new Error(`匿名登录校验失败：${scope || 'unknown'}`);
            return auth;
        })().catch(error => {
            cloudAuthPromise = null;
            throw error;
        });
    }
    return cloudAuthPromise;
}

async function cloudCall(data) {
    await ensureCloudAuth();
    const response = await cloudApp.callFunction({ name: 'environmentRecords', data });
    const result = response.result;
    if (!result || !result.success) throw new Error(result && result.error || response.message || '云端请求失败');
    return result;
}

function cloudRecordToHistory(record) {
    const raw = record.measuredAt || (record.createdAt && (record.createdAt.$date || record.createdAt));
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new Error('云端记录时间无效');
    const pad = value => String(value).padStart(2, '0');
    const time = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    return { id: record.recordId, recordId: record.recordId, time,
        nodeId: record.nodeId, measuredAt: record.measuredAt,
        temperature: record.temperature, humidity: record.humidity,
        status: record.status, advice: record.advice, source: record.source };
}

async function getCloudHistory() {
    const all = [];
    let offset = 0;
    do {
        const page = await cloudCall({ action: 'list', offset, limit: 100 });
        all.push(...page.records.map(cloudRecordToHistory));
        offset = page.nextOffset;
    } while (offset !== null);
    return all;
}

function saveCloudRecord(record) {
    return cloudCall({ action: 'add', source: record.source === 'mqtt' ? 'mqtt' : 'web',
        recordId: record.recordId || record.id, temperature: record.temperature, humidity: record.humidity,
        ...(record.nodeId ? { nodeId: record.nodeId } : {}),
        ...(record.measuredAt ? { measuredAt: record.measuredAt } : {}) });
}
