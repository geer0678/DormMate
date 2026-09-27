const cloudApp = window.cloudbase && cloudbase.init({ env: 'cloudbase-d6g6fprx873111e6a' });

async function cloudCall(data) {
    if (!cloudApp) throw new Error('CloudBase SDK 未加载');
    const auth = cloudApp.auth;
    if (auth && typeof auth.signInAnonymously === 'function') {
        const login = await auth.signInAnonymously();
        if (login && login.error) throw new Error(login.error.message || '匿名登录失败');
    }
    const response = await cloudApp.callFunction({ name: 'environmentRecords', data });
    const result = response.result;
    if (!result || !result.success) throw new Error(result && result.error || response.message || '云端请求失败');
    return result;
}

function cloudRecordToHistory(record) {
    const raw = record.createdAt && (record.createdAt.$date || record.createdAt);
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) throw new Error('云端记录时间无效');
    const pad = value => String(value).padStart(2, '0');
    const time = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
        `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    return { id: record.recordId, recordId: record.recordId, time,
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
    return cloudCall({ action: 'add', source: 'web', recordId: record.id,
        temperature: record.temperature, humidity: record.humidity });
}
