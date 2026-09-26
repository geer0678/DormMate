// ========================================
// DormMate 宿舍环境监测系统
// ========================================


// ========================================
// 1. 获取网页元素
// ========================================

// 温度输入框
const temperatureInput =
    document.getElementById("temperature");

// 湿度输入框
const humidityInput =
    document.getElementById("humidity");

// 分析按钮
const analyzeButton =
    document.getElementById("analyzeButton");

// 当前分析结果
const result =
    document.getElementById("result");

// 历史记录表格
const historyBody =
    document.getElementById("historyBody");

// CSV 导出按钮
const exportButton =
    document.getElementById("exportButton");


// ========================================
// 2. 从浏览器读取历史记录
// ========================================

const history =
    JSON.parse(
        localStorage.getItem("dormMateHistory")
    ) || [];


// ========================================
// 3. 显示历史记录
// ========================================

function displayHistory() {

    // 清空原来的表格
    historyBody.innerHTML = "";

    // 遍历所有历史记录
    history.forEach(function (record) {

        // 创建一行
        const row =
            document.createElement("tr");

        // 写入这一行的数据
        row.innerHTML = `
            <td>${record.time}</td>
            <td>${record.temperature}℃</td>
            <td>${record.humidity}%</td>
            <td>${record.status}</td>
        `;

        // 添加到表格
        historyBody.appendChild(row);
    });
}


// ========================================
// 4. 更新数据概览
// ========================================

function updateAnalysisOverview() {

    // 如果还没有记录
    if (history.length === 0) {

        document.getElementById(
            "analysisCount"
        ).textContent = "0 条";

        document.getElementById(
            "analysisTemp"
        ).textContent = "--";

        document.getElementById(
            "analysisHumidity"
        ).textContent = "--";

        document.getElementById(
            "analysisAbnormal"
        ).textContent = "--";

        return;
    }


    // 温度总和
    let totalTemperature = 0;

    // 湿度总和
    let totalHumidity = 0;

    // 异常记录数量
    let abnormalCount = 0;


    // 遍历历史记录
    history.forEach(function (record) {

        const temperature =
            Number(record.temperature);

        const humidity =
            Number(record.humidity);

        // 累加温度
        totalTemperature +=
            temperature;

        // 累加湿度
        totalHumidity +=
            humidity;

        // 只要不是正常，就算异常
        if (record.status !== "正常") {

            abnormalCount += 1;
        }
    });


    // 计算平均温度
    const averageTemperature =
        totalTemperature / history.length;

    // 计算平均湿度
    const averageHumidity =
        totalHumidity / history.length;

    // 计算异常占比
    const abnormalRate =
        abnormalCount /
        history.length *
        100;


    // 显示记录数量
    document.getElementById(
        "analysisCount"
    ).textContent =
        history.length + " 条";


    // 显示平均温度
    document.getElementById(
        "analysisTemp"
    ).textContent =
        averageTemperature.toFixed(2)
        + " ℃";


    // 显示平均湿度
    document.getElementById(
        "analysisHumidity"
    ).textContent =
        averageHumidity.toFixed(2)
        + " %";


    // 显示异常占比
    document.getElementById(
        "analysisAbnormal"
    ).textContent =
        abnormalRate.toFixed(2)
        + " %";
}


// ========================================
// 5. 点击“分析环境”
// ========================================

analyzeButton.addEventListener(
    "click",
    function () {

        // 获取温度
        const temperature =
            Number(temperatureInput.value);

        // 获取湿度
        const humidity =
            Number(humidityInput.value);


        // =================================
        // 输入校验
        // =================================

        if (
            temperatureInput.value === "" ||
            humidityInput.value === "" ||
            Number.isNaN(temperature) ||
            Number.isNaN(humidity)
        ) {

            result.innerHTML = `
                <p>当前状态：输入无效</p>
                <p>建议：请输入有效的温度和湿度</p>
            `;

            return;
        }

        if (
            temperature < 0 ||
            temperature > 50 ||
            humidity < 0 ||
            humidity > 100
        ) {

            result.innerHTML = `
                <p>当前状态：输入无效</p>
                <p>建议：温度应在 0～50℃，湿度应在 0～100%</p>
            `;

            return;
        }

        // =================================
        // DormMate 环境判断规则（增强版）
        // =================================

        let status;
        let advice;


        // ================================
        // 温度等级
        // ================================

        let temperatureLevel;

        if (temperature < 18) {

            temperatureLevel = "cold";

        }

        else if (temperature >= 30) {

            temperatureLevel = "hot";

        }

        else {

            temperatureLevel = "normal";

        }



        // ================================
        // 湿度等级
        // ================================

        let humidityLevel;


        if (humidity < 40) {

            humidityLevel = "dry";

        }

        else if (humidity >= 75) {

            humidityLevel = "humid";

        }

        else {

            humidityLevel = "normal";

        }



        // ================================
        // 状态判断（保持任务书四状态）
        // ================================


        if (temperatureLevel === "cold") {

            status = "偏冷";

        }

        else if (temperatureLevel === "hot") {

            status = "偏热";

        }

        else if (humidityLevel === "humid") {

            status = "偏湿";

        }

        else {

            status = "正常";

        }



        // ================================
        // 九种组合建议
        // ================================


        let environmentKey =
            temperatureLevel + "_" + humidityLevel;



        const adviceMap = {


            // 偏冷
            "cold_dry":
                "当前环境温度较低且空气偏干，建议注意保暖，并适当增加空气湿度。",


            "cold_normal":
                "当前温度偏低，湿度适宜，建议增加保暖措施。",


            "cold_humid":
                "当前环境低温高湿，可能产生阴冷感，建议加强保暖并保持通风。",



            // 正常温度
            "normal_dry":
                "当前温度适宜，但空气偏干，建议适当增加环境湿度。",


            "normal_normal":
                "当前温湿度适宜，请继续保持良好通风。",


            "normal_humid":
                "当前温度适宜，但空气湿度较高，建议加强通风或进行除湿。",



            // 偏热
            "hot_dry":
                "当前温度较高且空气偏干，建议适当降温，同时避免环境过度干燥。",


            "hot_normal":
                "当前温度较高，湿度正常，建议保持空气流通并降低室内温度。",


            "hot_humid":
                "当前环境高温高湿，容易产生闷热感，建议加强通风并降低湿度。"

        };


        // 根据组合获取建议

        advice = adviceMap[environmentKey];

        
        // =================================
        // 显示当前分析结果
        // =================================

        result.innerHTML = `
            <p>当前状态：${status}</p>
            <p>建议：${advice}</p>
        `;


        // =================================
        // 获取当前时间
        // =================================

        const now =
            new Date();

        const twoDigits =
            (value) => String(value).padStart(2, "0");

        const time =
            `${now.getFullYear()}-` +
            `${twoDigits(now.getMonth() + 1)}-` +
            `${twoDigits(now.getDate())} ` +
            `${twoDigits(now.getHours())}:` +
            `${twoDigits(now.getMinutes())}:` +
            `${twoDigits(now.getSeconds())}`;


        // =================================
        // 创建历史记录
        // =================================

        const record = {

            time: time,

            temperature: temperature,

            humidity: humidity,

            status: status
        };


        // =================================
        // 加入历史数组
        // =================================

        history.push(record);


        // =================================
        // 保存到浏览器
        // =================================

        localStorage.setItem(
            "dormMateHistory",
            JSON.stringify(history)
        );


        // =================================
        // 更新历史记录表格
        // =================================

        displayHistory();


        // =================================
        // 更新顶部统计卡片
        // =================================

        updateAnalysisOverview();

    }
);


// ========================================
// 6. 导出 CSV
// ========================================

exportButton.addEventListener(
    "click",
    function () {

        // CSV 表头
        let csv =
            "time,temperature,humidity,status\n";


        // 把每一条记录加入 CSV
        history.forEach(
            function (record) {

                csv +=
                    `${record.time},` +
                    `${record.temperature},` +
                    `${record.humidity},` +
                    `${record.status}\n`;
            }
        );


        // 转换成文件
        const blob =
            new Blob(
                ["\uFEFF" + csv],
                {
                    type:
                        "text/csv;charset=utf-8;"
                }
            );


        // 创建临时下载地址
        const url =
            URL.createObjectURL(blob);


        // 创建下载链接
        const link =
            document.createElement("a");


        link.href = url;

        link.download =
            "dormmate.csv";


        // 临时放入网页
        document.body.appendChild(link);


        // 自动下载
        link.click();


        // 删除临时链接
        document.body.removeChild(link);


        // 释放临时地址
        setTimeout(
            function () {

                URL.revokeObjectURL(url);

            },
            1000
        );

    }
);


// ========================================
// 7. 网页打开时自动执行
// ========================================

// 显示之前保存的历史记录
displayHistory();

// 计算并显示数据概览
updateAnalysisOverview();
// ========================================
// M3：摄像头功能
// ========================================

// 用来保存摄像头的视频流
let cameraStream = null;


// ========================================
// 打开摄像头
// ========================================

async function startCamera() {

    // 获取网页中的元素
    const video = document.getElementById("cameraVideo");

    const placeholder =
        document.getElementById("cameraPlaceholder");

    const status =
        document.getElementById("cameraStatus");


    try {

        // 请求浏览器使用摄像头
        cameraStream =
            await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: false
            });


        // 把摄像头画面放进 video
        video.srcObject = cameraStream;


        // 显示摄像头画面
        video.style.display = "block";


        // 隐藏“摄像头尚未开启”
        placeholder.style.display = "none";


        // 修改状态
        status.textContent =
            "当前状态：摄像头已开启";


        console.log("摄像头开启成功");

    }

    catch (error) {

        console.error(
            "摄像头开启失败：",
            error
        );


        status.textContent =
            "当前状态：摄像头开启失败";


        alert(
            "无法打开摄像头，请检查浏览器摄像头权限。"
        );

    }

}


// ========================================
// 关闭摄像头
// ========================================

function stopCamera() {

    const video =
        document.getElementById("cameraVideo");

    const placeholder =
        document.getElementById("cameraPlaceholder");

    const status =
        document.getElementById("cameraStatus");


    // 如果摄像头已经开启
    if (cameraStream) {

        // 获取所有摄像头轨道
        const tracks =
            cameraStream.getTracks();


        // 一个一个停止
        tracks.forEach(function (track) {

            track.stop();

        });


        // 清空视频流
        cameraStream = null;

    }


    // 清除 video
    video.srcObject = null;


    // 隐藏摄像头画面
    video.style.display = "none";


    // 显示默认提示
    placeholder.style.display = "flex";


    // 修改状态
    status.textContent =
        "当前状态：未开启";


    console.log("摄像头已关闭");

}
// ========================================
// M3：摄像头拍照功能
// ========================================

function capturePhoto() {

    // 找到摄像头画面
    const video =
        document.getElementById("cameraVideo");

    // 找到画布
    const canvas =
        document.getElementById("photoCanvas");

    // 找到拍照状态
    const photoStatus =
        document.getElementById("photoStatus");


    // ================================
    // 检查摄像头有没有开启
    // ================================

    if (!cameraStream) {

        alert(
            "请先打开摄像头，再进行拍照。"
        );

        return;
    }


    // ================================
    // 设置照片尺寸
    // ================================

    canvas.width =
        video.videoWidth;

    canvas.height =
        video.videoHeight;


    // ================================
    // 获取 Canvas 绘图工具
    // ================================

    const context =
        canvas.getContext("2d");


    // ================================
    // 把当前摄像头画面画到 Canvas
    // ================================

    context.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height
    );


    // ================================
    // 显示照片
    // ================================

    canvas.style.display =
        "block";


    // ================================
    // 修改提示文字
    // ================================

    photoStatus.textContent =
        "拍照成功！";


    console.log(
        "DormMate 摄像头拍照成功"
    );

}
// ========================================
// M3：ASR 语音识别
// ========================================

function startSpeechRecognition() {

    // ====================================
    // 兼容不同浏览器
    // ====================================

    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;


    // ====================================
    // 检查浏览器是否支持
    // ====================================

    if (!SpeechRecognition) {

        alert(
            "当前浏览器不支持语音识别，请使用最新版 Chrome 浏览器。"
        );

        return;
    }


    // ====================================
    // 创建语音识别对象
    // ====================================

    const recognition =
        new SpeechRecognition();


    // 设置识别语言为中文
    recognition.lang =
        "zh-CN";


    // 每次只识别一段话
    recognition.continuous =
        false;


    // 不显示中间识别结果
    recognition.interimResults =
        false;


    // ====================================
    // 获取网页元素
    // ====================================

    const speechResult =
        document.getElementById(
            "speechResult"
        );

    const speechStatus =
        document.getElementById(
            "speechStatus"
        );


    // ====================================
    // 开始识别时
    // ====================================

    recognition.onstart =
        function () {

            speechStatus.textContent =
                "当前状态：正在听你说话...";

            speechResult.textContent =
                "请开始说话...";
        };


    // ====================================
    // 成功识别语音
    // ====================================

    recognition.onresult =
        function (event) {

            // 获取识别出来的文字
            const text =
                event.results[0][0].transcript;


            // 显示 ASR 识别结果
            speechResult.textContent =
                text;


            speechStatus.textContent =
                "当前状态：识别成功";


            // ====================================
            // ASR → TTS 联动
            // ====================================

            // 找到 TTS 输入框
            const ttsText =
                document.getElementById("ttsText");


            // 自动把识别结果放进去
            ttsText.value =
                text;


            console.log(
                "语音识别结果：",
                text
            );

        };


    // ====================================
    // 识别结束
    // ====================================

    recognition.onend =
        function () {

            if (
                speechStatus.textContent ===
                "当前状态：正在听你说话..."
            ) {

                speechStatus.textContent =
                    "当前状态：识别结束";

            }

        };


    // ====================================
    // 发生错误
    // ====================================

    recognition.onerror =
        function (event) {

            console.error(
                "语音识别错误：",
                event.error
            );


            speechStatus.textContent =
                "当前状态：语音识别失败";


            if (
                event.error ===
                "not-allowed"
            ) {

                alert(
                    "请允许浏览器使用麦克风。"
                );

            }

        };


    // ====================================
    // 正式启动语音识别
    // ====================================

    recognition.start();

}
// ========================================
// M3：TTS 语音合成
// ========================================

function speakText() {

    // 获取输入框中的文字
    const text =
        document.getElementById("ttsText").value.trim();

    const status =
        document.getElementById("ttsStatus");


    // 没有输入文字
    if (text === "") {

        alert("请输入需要播报的文字。");

        return;
    }


    // 检查浏览器是否支持语音合成
    if (!("speechSynthesis" in window)) {

        alert("当前浏览器不支持语音合成功能。");

        return;
    }


    // 如果之前正在说话，先停止
    window.speechSynthesis.cancel();


    // 创建语音对象
    const speech =
        new SpeechSynthesisUtterance(text);


    // 设置中文
    speech.lang = "zh-CN";


    // 语速
    speech.rate = 1;


    // 音调
    speech.pitch = 1;


    // 音量
    speech.volume = 1;


    // 开始播放
    speech.onstart = function () {

        status.textContent =
            "当前状态：正在播报...";

    };


    // 播放结束
    speech.onend = function () {

        status.textContent =
            "当前状态：播报完成";

    };


    // 出现错误
    speech.onerror = function () {

        status.textContent =
            "当前状态：播报失败";

    };


    // 开始语音合成
    window.speechSynthesis.speak(speech);

}


// ========================================
// 停止语音播报
// ========================================

function stopSpeaking() {

    window.speechSynthesis.cancel();

    document.getElementById(
        "ttsStatus"
    ).textContent =
        "当前状态：已停止播报";

}
