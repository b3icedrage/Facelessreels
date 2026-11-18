package app.ghostclipper;

import android.content.Context;
import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.net.Uri;
import org.json.JSONArray;
import org.json.JSONObject;
import org.vosk.Model;
import org.vosk.Recognizer;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/** Offline speech-to-text using the small English Vosk model. */
public final class VoskCaptioner {
    private static final String MODEL_URL="https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip";
    private static final String MODEL_NAME="vosk-model-small-en-us-0.15";
    private VoskCaptioner(){}

    public static File ensureModel(Context c) throws Exception {
        File base=new File(c.getFilesDir(),"speech-models");
        File model=new File(base,MODEL_NAME);
        if(new File(model,"conf/model.conf").exists())return model;
        if(!base.exists()&&!base.mkdirs())throw new IOException("Cannot create model folder");
        File zip=new File(base,"vosk-model.zip");
        HttpURLConnection conn=(HttpURLConnection)new URL(MODEL_URL).openConnection();
        conn.setConnectTimeout(20000);conn.setReadTimeout(120000);
        try(InputStream in=conn.getInputStream();FileOutputStream out=new FileOutputStream(zip)){
            byte[] buf=new byte[65536];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);
        }finally{conn.disconnect();}
        try(ZipInputStream zin=new ZipInputStream(new BufferedInputStream(new FileInputStream(zip)))){
            ZipEntry entry;
            while((entry=zin.getNextEntry())!=null){
                File dest=new File(base,entry.getName());
                if(!dest.getCanonicalPath().startsWith(base.getCanonicalPath()+File.separator))throw new IOException("Unsafe model archive path");
                if(entry.isDirectory()){dest.mkdirs();}
                else{File parent=dest.getParentFile();if(parent!=null)parent.mkdirs();try(FileOutputStream out=new FileOutputStream(dest)){byte[] buf=new byte[65536];int n;while((n=zin.read(buf))!=-1)out.write(buf,0,n);}}
                zin.closeEntry();
            }
        }
        zip.delete();
        if(!new File(model,"conf/model.conf").exists())throw new IOException("Speech model archive was incomplete");
        return model;
    }

    public static String transcribe(Context context,Uri uri,File modelDir) throws Exception {
        MediaExtractor extractor=new MediaExtractor();
        Model model=null;Recognizer recognizer=null;MediaCodec codec=null;
        StringBuilder srt=new StringBuilder();int cue=1;
        try{
            extractor.setDataSource(context,uri,null);
            int track=-1;MediaFormat audioFormat=null;
            for(int i=0;i<extractor.getTrackCount();i++){
                MediaFormat f=extractor.getTrackFormat(i);
                String mime=f.getString(MediaFormat.KEY_MIME);
                if(mime!=null&&mime.startsWith("audio/")){track=i;audioFormat=f;break;}
            }
            if(track<0)throw new IOException("No audio track found in this video");
            int sampleRate=audioFormat.getInteger(MediaFormat.KEY_SAMPLE_RATE);
            int channels=audioFormat.containsKey(MediaFormat.KEY_CHANNEL_COUNT)?audioFormat.getInteger(MediaFormat.KEY_CHANNEL_COUNT):1;
            extractor.selectTrack(track);
            String mime=audioFormat.getString(MediaFormat.KEY_MIME);
            codec=MediaCodec.createDecoderByType(mime);
            codec.configure(audioFormat,null,null,0);codec.start();
            model=new Model(modelDir.getAbsolutePath());
            recognizer=new Recognizer(model,sampleRate);recognizer.setWords(true);
            MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
            boolean inputDone=false,outputDone=false;
            while(!outputDone){
                if(!inputDone){
                    int inIndex=codec.dequeueInputBuffer(10000);
                    if(inIndex>=0){
                        ByteBuffer in=codec.getInputBuffer(inIndex);
                        int size=extractor.readSampleData(in,0);
                        if(size<0){codec.queueInputBuffer(inIndex,0,0,0,MediaCodec.BUFFER_FLAG_END_OF_STREAM);inputDone=true;}
                        else{long pts=extractor.getSampleTime();codec.queueInputBuffer(inIndex,0,size,pts,0);extractor.advance();}
                    }
                }
                int outIndex=codec.dequeueOutputBuffer(info,10000);
                if(outIndex>=0){
                    ByteBuffer out=codec.getOutputBuffer(outIndex);
                    if(info.size>0&&out!=null){
                        out.position(info.offset);out.limit(info.offset+info.size);
                        byte[] pcm=new byte[info.size];out.get(pcm);
                        byte[] mono=toMono16(pcm,channels);
                        if(recognizer.acceptWaveForm(mono,mono.length)){
                            cue=appendResult(srt,recognizer.getResult(),cue);
                        }
                    }
                    codec.releaseOutputBuffer(outIndex,false);
                    if((info.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0)outputDone=true;
                }
            }
            cue=appendResult(srt,recognizer.getFinalResult(),cue);
            if(srt.length()==0)throw new IOException("No speech was recognized. Try a clearer video with spoken English.");
            return srt.toString();
        }finally{
            if(recognizer!=null)recognizer.close();if(model!=null)model.close();
            if(codec!=null){try{codec.stop();}catch(Exception ignored){}codec.release();}
            extractor.release();
        }
    }

    private static byte[] toMono16(byte[] pcm,int channels){
        if(channels<=1)return pcm;
        int frames=pcm.length/(2*channels);byte[] mono=new byte[frames*2];
        for(int i=0;i<frames;i++){
            int sum=0;for(int ch=0;ch<channels;ch++){int p=(i*channels+ch)*2;short v=(short)((pcm[p]&255)|((pcm[p+1]&255)<<8));sum+=v;}
            short avg=(short)(sum/channels);mono[i*2]=(byte)(avg&255);mono[i*2+1]=(byte)((avg>>8)&255);
        }
        return mono;
    }
    private static int appendResult(StringBuilder out,String json,int index)throws Exception{
        JSONObject obj=new JSONObject(json);JSONArray words=obj.optJSONArray("result");
        if(words==null||words.length()==0)return index;
        StringBuilder line=new StringBuilder();double start=-1,end=0;
        for(int i=0;i<words.length();i++){
            JSONObject w=words.getJSONObject(i);String word=w.optString("word","").trim();
            if(word.length()==0)continue;
            double ws=w.optDouble("start",0),we=w.optDouble("end",ws);
            if(start<0)start=ws;end=we;
            if(line.length()>0)line.append(' ');line.append(word);
            if(line.length()>48||i==words.length()-1){
                out.append(index++).append('\n').append(timestamp(start)).append(" --> ").append(timestamp(end)).append('\n').append(line).append("\n\n");
                line.setLength(0);start=-1;
            }
        }
        return index;
    }
    private static String timestamp(double sec){
        long ms=Math.max(0,Math.round(sec*1000));long h=ms/3600000;ms%=3600000;long m=ms/60000;ms%=60000;long s=ms/1000;long milli=ms%1000;
        return String.format(Locale.US,"%02d:%02d:%02d,%03d",h,m,s,milli);
    }
}
