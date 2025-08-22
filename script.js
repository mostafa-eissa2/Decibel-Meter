window.onload = () => {
    // --- STATE MANAGEMENT ---
    let audioContext, microphone, analyser;
    let isLive = false;
    let isRecording = false;
    let recordedData = [];
    let recordingInterval;

    // --- DOM ELEMENTS ---
    const dbValueElement = document.getElementById('db-value');
    const needleElement = document.getElementById('needle');
    const startStopBtn = document.getElementById('start-stop-btn');
    const recordBtn = document.getElementById('record-btn');
    const clearRecordingsBtn = document.getElementById('clear-recordings-btn');
    const generatePdfBtn = document.getElementById('generate-pdf-btn');
    const reporterNameInput = document.getElementById('reporter-name');
    const logoUploadInput = document.getElementById('logo-upload');
    const recordingResultsSection = document.getElementById('recording-results');
    const resultsTableBody = document.querySelector('#results-table tbody');
    const resultsTableHeader = document.querySelector('#results-table thead tr');

    // --- CORE METER LOGIC ---
    startStopBtn.addEventListener('click', () => isLive ? stopMeter() : startMeter());

    async function startMeter() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            microphone = audioContext.createMediaStreamSource(stream);

            analyser.fftSize = 256;
            microphone.connect(analyser);

            isLive = true;
            startStopBtn.textContent = 'STOP LIVE';
            startStopBtn.classList.add('running');
            recordBtn.disabled = false;

            updateLoop();
        } catch (err) {
            alert('Error: Could not access the microphone. Please grant permission and ensure the site is on HTTPS.');
            console.error('Error accessing microphone:', err);
        }
    }

    function stopMeter() {
        if (microphone && microphone.mediaStream) {
            microphone.mediaStream.getTracks().forEach(track => track.stop());
        }
        if (audioContext) audioContext.close();
        if (isRecording) stopRecording();

        isLive = false;
        startStopBtn.textContent = 'GO LIVE';
        startStopBtn.classList.remove('running');
        recordBtn.disabled = true;
    }

    function updateLoop() {
        if (!isLive) return;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteTimeDomainData(dataArray);

        let sumSquares = 0.0;
        for (let i = 0; i < bufferLength; i++) {
            const normSample = (dataArray[i] / 128.0) - 1.0;
            sumSquares += normSample * normSample;
        }
        const rms = Math.sqrt(sumSquares / bufferLength);

        const calibrationFactor = 90;
        let db = 20 * Math.log10(rms) + calibrationFactor;
        db = Math.max(0, Math.min(140, db));

        if (isFinite(db)) {
            updateUI(db);
        }
        requestAnimationFrame(updateLoop);
    }

    function updateUI(db) {
        dbValueElement.textContent = db.toFixed(1);
        const rotation = (db / 140) * 180 - 45;
        needleElement.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
    }

    // --- RECORDING LOGIC (UPDATED) ---
    recordBtn.addEventListener('click', () => isRecording ? stopRecording() : startRecording());

    function startRecording() {
        isRecording = true;
        recordBtn.textContent = 'Stop Recording';
        recordBtn.classList.add('recording');

        recordingInterval = setInterval(() => {
            const currentDb = parseFloat(dbValueElement.textContent);
            if (!isNaN(currentDb)) {
                const timeStep = recordedData.length * 20;
                recordedData.push([timeStep, currentDb.toFixed(1)]);
                updateRecordingsTable();
            }
        }, 1000); // Record every 20 seconds
    }

    function stopRecording() {
        isRecording = false;
        clearInterval(recordingInterval);
        recordBtn.textContent = 'Record';
        recordBtn.classList.remove('recording');
    }

    function updateRecordingsTable() {
        recordingResultsSection.style.display = 'block';
        resultsTableBody.innerHTML = ''; // Clear previous

        // Update the table header
        resultsTableHeader.innerHTML = '<th>Time (s)</th><th>dB Level</th>';

        recordedData.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td>${row[0]}</td><td>${row[1]}</td>`;
            resultsTableBody.appendChild(tr);
        });
    }

    clearRecordingsBtn.addEventListener('click', () => {
        recordedData = [];
        resultsTableBody.innerHTML = '';
        recordingResultsSection.style.display = 'none';
    });


    // --- PDF GENERATION LOGIC (UPDATED) ---
    generatePdfBtn.addEventListener('click', () => {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const reporterName = reporterNameInput.value || 'N/A';
        const logoFile = logoUploadInput.files[0];

        const addContentToPdf = (logoDataUrl) => {
            // Add Logo with fixed dimensions and adjusted position
            if (logoDataUrl) {
                doc.addImage(logoDataUrl, 'PNG', 15, 15, 60, 15, undefined, 'FAST'); // x, y, width, height
            }

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(20);
            doc.text("Noise Level Measurement Report", 105, logoDataUrl ? 40 : 25, { align: 'center' }); // Adjust title Y if logo exists

            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            doc.text(`Prepared by: ${reporterName}`, 15, logoDataUrl ? 55 : 40);
            doc.text(`Date: ${new Date().toLocaleDateString('en-US')}`, 15, logoDataUrl ? 62 : 47);

            if (recordedData.length > 0) {
                doc.autoTable({
                    head: [['Time (seconds)', 'Decibel Level (dB)']],
                    body: recordedData,
                    startY: logoDataUrl ? 70 : 55,
                    theme: 'grid',
                    headStyles: { fillColor: [0, 123, 255] }
                });
            } else {
                doc.text("No data was recorded for this report.", 15, logoDataUrl ? 70 : 60);
            }

            const finalY = doc.lastAutoTable.finalY || (logoDataUrl ? 80 : 70);

            doc.setFontSize(10);
            doc.setTextColor(150);


            doc.save(`sound-report-${Date.now()}.pdf`);
        };

        if (logoFile) {
            const reader = new FileReader();
            reader.onload = (event) => addContentToPdf(event.target.result);
            reader.readAsDataURL(logoFile);
        } else {
            addContentToPdf(null);
        }
    });
};