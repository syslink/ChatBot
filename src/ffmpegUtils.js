import FfmpegCommand  from 'fluent-ffmpeg';

const ffmpeg = new FfmpegCommand();
const fileName = "./voiceFiles/849007458-129.ogg";
const outputFileName = "./voiceFiles/849007458-129.mp3";
ffmpeg.input(fileName)
        .output(outputFileName)
        .on('end', function() {
        console.log('\n\n' + fileName + ' => ' + outputFileName);       
        })
        .on('error', function(err) {
        console.log(fileName + ' =xx=> ' + outputFileName + ":" + err.message);
        //ffmpeg.close();
        })
        .run();  

//  ffmpeg.input(fileName)
//         //.setFfmpegPath("C:\\ffmpeg\\bin\\ffmpeg.exe")
//         .toFormat('mp3')
//         .on('error', (err) => {
//             console.log('An error occurred: ' + err.message);
//         })
//         .on('progress', (progress) => {
//             // console.log(JSON.stringify(progress));
//             console.log('Processing: ' + progress.targetSize + ' KB converted');
//         })
//         .on('end', () => {
//             console.log('Processing finished !');
//         })
//         .save(outputFileName);