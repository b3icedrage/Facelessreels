package app.ghostclipper;

import android.media.MediaCodec;
import android.media.MediaExtractor;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import java.io.File;
import java.nio.ByteBuffer;
import java.util.List;

public final class Mp4SegmentMerger {
    private Mp4SegmentMerger(){}
    public static File merge(List<String> paths,File output)throws Exception{
        if(paths==null||paths.isEmpty())throw new IllegalArgumentException("No video segments to merge.");
        MediaMuxer muxer=new MediaMuxer(output.getAbsolutePath(),MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
        boolean started=false;int outTrack=-1;long offsetUs=0;
        try{
            for(String path:paths){
                MediaExtractor extractor=new MediaExtractor();
                try{
                    extractor.setDataSource(path);
                    int inTrack=-1;
                    for(int i=0;i<extractor.getTrackCount();i++){
                        MediaFormat f=extractor.getTrackFormat(i);
                        String mime=f.getString(MediaFormat.KEY_MIME);
                        if(mime!=null&&mime.startsWith("video/")){
                            inTrack=i;
                            if(!started){outTrack=muxer.addTrack(f);muxer.start();started=true;}
                            break;
                        }
                    }
                    if(inTrack<0)continue;
                    extractor.selectTrack(inTrack);
                    MediaFormat format=extractor.getTrackFormat(inTrack);
                    int size=format.containsKey(MediaFormat.KEY_MAX_INPUT_SIZE)?format.getInteger(MediaFormat.KEY_MAX_INPUT_SIZE):2097152;
                    ByteBuffer buffer=ByteBuffer.allocateDirect(Math.max(size,1048576));
                    MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
                    long segmentEnd=0;
                    while(true){
                        buffer.clear();int n=extractor.readSampleData(buffer,0);if(n<0)break;
                        long pts=extractor.getSampleTime();int flags=extractor.getSampleFlags();
                        info.set(0,n,Math.max(0,pts)+offsetUs,flags);
                        muxer.writeSampleData(outTrack,buffer,info);
                        segmentEnd=Math.max(segmentEnd,pts);
                        extractor.advance();
                    }
                    offsetUs+=segmentEnd+33333L;
                }finally{extractor.release();}
            }
            if(!started)throw new IllegalStateException("The recorded segments contain no video track.");
            return output;
        }finally{
            if(started){try{muxer.stop();}catch(Exception ignored){}}
            muxer.release();
        }
    }
}