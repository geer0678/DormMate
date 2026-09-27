// ========================================
// DormMate 宿舍环境监测系统
// ========================================

// 获取网页元素
const temperatureInput =
    document.getElementById("temperature");

const humidityInput =
    document.getElementById("humidity");

const analyzeButton =
    document.getElementById("analyzeButton");

const result =
    document.getElementById("result");

const historyBody =
    document.getElementById("historyBody");

const exportButton =
    document.getElementById("exportButton");


// ========================================
// 历史记录
// ========================================

const history =
    JSON.parse(
        localStorage.getItem("dormMateHistory")
    ) || [];


// ========================================
// 显示历史记录
// ========================================

function displayHistory() {

    historyBody.innerHTML = "";

    history.forEach(function(record) {

        const row =
            document.createElement("tr");

        row.innerHTML = `
            <td>${record.time}</td>
            <td>${record.temperature}℃</td>
            <td>${record.humidity}%</td>
            <td>${record.status}</td>
            <td>${record.advice || "暂无建议"}</td>
            <td>${record.source === 'web' ? 'Web' : record.source === 'miniprogram' ? '小程序' : '本地缓存'}</td>
        `;

        historyBody.appendChild(row);

    });

}

async function refreshSharedHistory() {
    const syncStatus = document.getElementById('syncStatus');
    try {
        const shared = await getCloudHistory();
        history.splice(0, history.length, ...shared);
        localStorage.setItem('dormMateHistory', JSON.stringify(history));
        displayHistory();
        updateAnalysisOverview();
        syncStatus.textContent = `共享历史已更新：${shared.length} 条`;
        return true;
    } catch (error) {
        syncStatus.textContent = `云端刷新失败，显示本机缓存：${error.message}`;
        return false;
    }
}


// ========================================
// 更新数据概览
// ========================================

function updateAnalysisOverview() {

    if(history.length === 0){

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


    let totalTemperature = 0;
    let totalHumidity = 0;
    let abnormalCount = 0;


    history.forEach(function(record){

        const temperature =
            Number(record.temperature);

        const humidity =
            Number(record.humidity);


        totalTemperature += temperature;

        totalHumidity += humidity;


        if(record.status !== "正常"){

            abnormalCount++;

        }

    });


    const averageTemperature =
        totalTemperature / history.length;


    const averageHumidity =
        totalHumidity / history.length;


    const abnormalRate =
        abnormalCount /
        history.length *
        100;


    document.getElementById(
        "analysisCount"
    ).textContent =
        history.length + " 条";


    document.getElementById(
        "analysisTemp"
    ).textContent =
        averageTemperature.toFixed(2)
        + " ℃";


    document.getElementById(
        "analysisHumidity"
    ).textContent =
        averageHumidity.toFixed(2)
        + " %";


    document.getElementById(
        "analysisAbnormal"
    ).textContent =
        abnormalRate.toFixed(2)
        + " %";

}


// ========================================
// 分析环境
// ========================================

analyzeButton.addEventListener(
"click",
async function(){

    const temperature =
        Number(
            temperatureInput.value
        );


    const humidity =
        Number(
            humidityInput.value
        );


    if(
        temperatureInput.value === "" ||
        humidityInput.value === "" ||
        Number.isNaN(temperature) ||
        Number.isNaN(humidity)
    ){

        result.innerHTML = `
            <p>当前状态：输入无效</p>
            <p>建议：请输入有效的温度和湿度</p>
        `;

        return;

    }


    if(
        temperature < 0 ||
        temperature > 50 ||
        humidity < 0 ||
        humidity > 100
    ){

        result.innerHTML = `
            <p>当前状态：输入无效</p>
            <p>建议：温度应在0～50℃，湿度应在0～100%</p>
        `;

        return;

    }



    let status;
    let advice;



    let temperatureLevel;


    if(temperature < 18){

        temperatureLevel = "cold";

    }
    else if(temperature >= 30){

        temperatureLevel = "hot";

    }
    else{

        temperatureLevel = "normal";

    }



    let humidityLevel;


    if(humidity < 40){

        humidityLevel = "dry";

    }
    else if(humidity >= 75){

        humidityLevel = "humid";

    }
    else{

        humidityLevel = "normal";

    }



    const environmentKey =
        temperatureLevel +
        "_" +
        humidityLevel;


    const statusMap = {
        "cold_dry": "偏冷偏干",
        "cold_normal": "偏冷",
        "cold_humid": "偏冷偏湿",
        "normal_dry": "偏干",
        "normal_normal": "正常",
        "normal_humid": "偏湿",
        "hot_dry": "偏热偏干",
        "hot_normal": "偏热",
        "hot_humid": "偏热偏湿"
    };

    status =
        statusMap[environmentKey] || "正常";



    const adviceMap = {

        "cold_dry":
        "当前环境温度较低且空气偏干，建议注意保暖，并适当增加空气湿度。",

        "cold_normal":
        "当前温度偏低，湿度适宜，建议增加保暖措施。",

        "cold_humid":
        "当前环境低温高湿，建议加强保暖并保持通风。",

        "normal_dry":
        "当前温度适宜，但空气偏干，建议适当增加湿度。",

        "normal_normal":
        "当前温湿度适宜，请继续保持良好通风。",

        "normal_humid":
        "当前温度适宜，但湿度较高，建议加强通风或除湿。",

        "hot_dry":
        "当前温度较高且空气偏干，建议适当降温。",

        "hot_normal":
        "当前温度较高，建议保持空气流通并降低温度。",

        "hot_humid":
        "当前环境高温高湿，容易产生闷热感，建议加强通风并降低湿度。"

    };


    advice =
        adviceMap[environmentKey];


    result.innerHTML = `
        <p>当前状态：${status}</p>
        <p>建议：${advice}</p>
    `;


    // M3新增：
    // 分析结果自动进入TTS

    const ttsText =
        document.getElementById(
            "ttsText"
        );

    if(ttsText){

    ttsText.value = advice;

        setTimeout(
            function(){

                speakText();

            },
            300
        );

    }
        const now =
        new Date();


    const twoDigits =
        (value) =>
        String(value).padStart(2,"0");


    const time =
        `${now.getFullYear()}-` +
        `${twoDigits(now.getMonth()+1)}-` +
        `${twoDigits(now.getDate())} ` +
        `${twoDigits(now.getHours())}:` +
        `${twoDigits(now.getMinutes())}:` +
        `${twoDigits(now.getSeconds())}`;



    const record = {

        time: time,

        temperature: temperature,

        humidity: humidity,

        status: status,

        advice: advice

    };



    record.id = 'web-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
    try {
        await saveCloudRecord(record);
    } catch (error) {
        document.getElementById('syncStatus').textContent = `云端保存失败，本次记录未保存：${error.message}`;
        return;
    }
    const refreshed = await refreshSharedHistory();
    if (!refreshed) {
        history.push({ ...record, source: 'web' });
        localStorage.setItem('dormMateHistory', JSON.stringify(history));
        displayHistory();
        updateAnalysisOverview();
        document.getElementById('syncStatus').textContent = '云端已保存，历史刷新失败；请稍后点“刷新共享历史”';
    }


});



// ========================================
// CSV导出
// ========================================

exportButton.addEventListener(
"click",
function(){


    let csv =
        "time,temperature,humidity,status,advice\n";



    history.slice().reverse().forEach(function(record){


        csv +=

        `${record.time},` +

        `${record.temperature},` +

        `${record.humidity},` +

        `${record.status},` +

        `"${record.advice || "暂无建议"}"\n`;


    });



    const blob =

        new Blob(

            ["\uFEFF"+csv],

            {
                type:
                "text/csv;charset=utf-8;"
            }

        );



    const url =

        URL.createObjectURL(blob);



    const link =

        document.createElement("a");



    link.href = url;



    link.download =
        "dormmate.csv";



    document.body.appendChild(link);



    link.click();



    document.body.removeChild(link);



    setTimeout(

        function(){

            URL.revokeObjectURL(url);

        },

        1000

    );


});



// ========================================
// 页面加载
// ========================================

displayHistory();

updateAnalysisOverview();
document.getElementById('refreshCloudButton').addEventListener('click', refreshSharedHistory);
refreshSharedHistory();




// ========================================
// M3 摄像头
// ========================================


let cameraStream = null;



async function startCamera(){


    const video =
        document.getElementById(
            "cameraVideo"
        );


    const placeholder =
        document.getElementById(
            "cameraPlaceholder"
        );


    const status =
        document.getElementById(
            "cameraStatus"
        );



    try{


        cameraStream =

        await navigator.mediaDevices.getUserMedia({

            video:true,

            audio:false

        });



        video.srcObject =
            cameraStream;



        video.style.display =
            "block";



        placeholder.style.display =
            "none";



        status.textContent =
            "当前状态：摄像头已开启";


    }


    catch(error){


        console.error(
            "摄像头开启失败",
            error
        );


        status.textContent =
            "当前状态：摄像头开启失败";


        alert(
            "无法打开摄像头，请检查权限"
        );


    }


}




function stopCamera(){


    const video =
        document.getElementById(
            "cameraVideo"
        );


    const placeholder =
        document.getElementById(
            "cameraPlaceholder"
        );


    const status =
        document.getElementById(
            "cameraStatus"
        );



    if(cameraStream){


        cameraStream
        .getTracks()
        .forEach(
            function(track){

                track.stop();

            }
        );



        cameraStream = null;

    }



    video.srcObject = null;


    video.style.display =
        "none";


    placeholder.style.display =
        "flex";


    status.textContent =
        "当前状态：未开启";


}




// ========================================
// 摄像头拍照
// ========================================


function capturePhoto(){


    const video =
        document.getElementById(
            "cameraVideo"
        );


    const canvas =
        document.getElementById(
            "photoCanvas"
        );


    const photoStatus =
        document.getElementById(
            "photoStatus"
        );



    if(!cameraStream){


        alert(
            "请先打开摄像头"
        );


        return;

    }



    canvas.width =
        video.videoWidth;


    canvas.height =
        video.videoHeight;



    const context =
        canvas.getContext(
            "2d"
        );



    context.drawImage(

        video,

        0,

        0,

        canvas.width,

        canvas.height

    );



    canvas.style.display =
        "block";



    photoStatus.textContent =
        "拍照成功！";


}
// ========================================
// M3 ASR语音识别
// ========================================

function startSpeechRecognition(){


    const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;



    if(!SpeechRecognition){


        alert(
            "当前浏览器不支持语音识别，请使用Chrome"
        );


        return;

    }



    const recognition =
        new SpeechRecognition();



    recognition.lang =
        "zh-CN";


    recognition.continuous =
        false;


    recognition.interimResults =
        false;



    const speechResult =
        document.getElementById(
            "speechResult"
        );


    const speechStatus =
        document.getElementById(
            "speechStatus"
        );



    recognition.onstart =
    function(){


        speechStatus.textContent =
            "当前状态：正在听你说话...";


        speechResult.textContent =
            "请开始说话...";


    };



    recognition.onresult =
    function(event){


        const text =
            event.results[0][0].transcript;



        speechResult.textContent =
            text;



        speechStatus.textContent =
            "当前状态：识别成功";



        const command =
            text.trim().replace(/[。！？!?，,]+$/, "");

        const ttsText =
            document.getElementById(
                "ttsText"
            );

        // 固定语音指令；普通识别文字仍可填入 TTS。
        switch(command){

            case "分析环境":
            case "检测环境":
            case "查看环境":
                analyzeButton.click();
                break;

            case "查看历史记录": {
                document.getElementById(
                    "historyTable"
                ).scrollIntoView({behavior: "smooth"});

                speechStatus.textContent =
                    "当前状态：已打开历史记录";

                if(ttsText){
                    const previousText = ttsText.value;
                    ttsText.value = "已为你打开历史记录。";
                    speakText();
                    ttsText.value = previousText;
                }
                break;
            }

            case "导出数据":
                exportButton.click();
                break;

            case "打开摄像头":
                startCamera();
                break;

            case "关闭摄像头":
                stopCamera();
                break;

            case "播放建议":
                if(ttsText && history.length > 0){
                    ttsText.value =
                        history[history.length - 1].advice || ttsText.value;
                }
                speakText();
                break;

            case "停止播放":
                stopSpeaking();
                break;

            default:
                if(ttsText){
                    ttsText.value = text;
                }
        }



        console.log(
            "语音识别结果：",
            text
        );


    };



    recognition.onend =
    function(){


        if(
            speechStatus.textContent ===
            "当前状态：正在听你说话..."
        ){


            speechStatus.textContent =
                "当前状态：识别结束";


        }


    };



    recognition.onerror =
    function(event){


        console.error(
            "语音识别错误：",
            event.error
        );


        speechStatus.textContent =
            "当前状态：语音识别失败";


        if(
            event.error === "not-allowed"
        ){


            alert(
                "请允许浏览器使用麦克风"
            );


        }


    };



    recognition.start();


}





// ========================================
// M3 TTS语音合成
// ========================================

function speakText(){


    const text =
        document
        .getElementById(
            "ttsText"
        )
        .value
        .trim();



    const status =
        document.getElementById(
            "ttsStatus"
        );



    if(text === ""){


        alert(
            "请输入需要播报的文字"
        );


        return;


    }



    if(
        !("speechSynthesis" in window)
    ){


        alert(
            "当前浏览器不支持语音合成"
        );


        return;


    }



    window.speechSynthesis.cancel();



    const speech =
        new SpeechSynthesisUtterance(
            text
        );



    speech.lang =
        "zh-CN";


    speech.rate =
        1;


    speech.pitch =
        1;


    speech.volume =
        1;



    speech.onstart =
    function(){


        status.textContent =
            "当前状态：正在播报...";


    };



    speech.onend =
    function(){


        status.textContent =
            "当前状态：播报完成";


    };



    speech.onerror =
    function(){


        status.textContent =
            "当前状态：播报失败";


    };



    window.speechSynthesis.speak(
        speech
    );


}





// ========================================
// 停止TTS
// ========================================

function stopSpeaking(){


    window.speechSynthesis.cancel();



    document.getElementById(
        "ttsStatus"
    ).textContent =
        "当前状态：已停止播报";


}
