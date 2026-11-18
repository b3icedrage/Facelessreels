package app.ghostclipper;

import android.content.Context;
import android.graphics.Bitmap;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/** Lightweight on-device scene-change scanner. Suggestions are heuristic, not semantic AI. */
public final class HighlightDetector {
    public static final class Moment { public final long startMs,endMs; public final double score; Moment(long s,long e,double v){startMs=s;endMs=e;score=v;} }
    private HighlightDetector(){}
    public static List<Moment> detect(Context context, Uri uri, long durationMs) throws Exception {
        MediaMetadataRetriever r=new MediaMetadataRetriever(); List<Moment> candidates=new ArrayList<>();
        try { r.setDataSource(context,uri); String d=r.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION); long duration=durationMs>0?durationMs:(d==null?0:Long.parseLong(d)); if(duration<3000)return candidates;
            int step=(int)Math.max(1000,Math.min(3000,duration/180)); double[] previous=null; List<Double> scores=new ArrayList<>(); List<Long> times=new ArrayList<>();
            for(long t=0;t<duration;t+=step){Bitmap b=r.getFrameAtTime(t*1000,MediaMetadataRetriever.OPTION_CLOSEST_SYNC);if(b==null)continue;double[] hist=histogram(b);b.recycle();double change=previous==null?0:distance(previous,hist);previous=hist;times.add(t);scores.add(change);}
            for(int i=1;i<scores.size();i++){double score=scores.get(i);if(score>0.22){long center=times.get(i),start=Math.max(0,center-8000),end=Math.min(duration,center+7000);if(end-start>=3000)candidates.add(new Moment(start,end,score));}}
            Collections.sort(candidates,new Comparator<Moment>(){@Override public int compare(Moment a,Moment b){return Double.compare(b.score,a.score);}});
            List<Moment> result=new ArrayList<>();for(Moment m:candidates){boolean overlaps=false;for(Moment kept:result)if(Math.abs(kept.startMs-m.startMs)<10000){overlaps=true;break;}if(!overlaps)result.add(m);if(result.size()==5)break;}return result;
        } finally {try{r.release();}catch(Exception ignored){}}
    }
    private static double[] histogram(Bitmap b){double[] h=new double[64];int sx=Math.max(1,b.getWidth()/32),sy=Math.max(1,b.getHeight()/32),n=0;for(int y=0;y<b.getHeight();y+=sy)for(int x=0;x<b.getWidth();x+=sx){int c=b.getPixel(x,y),red=(c>>16)&255,green=(c>>8)&255,blue=c&255;h[(red/64)*16+(green/64)*4+(blue/64)]++;n++;}if(n>0)for(int i=0;i<h.length;i++)h[i]/=n;return h;}
    private static double distance(double[] a,double[] b){double d=0;for(int i=0;i<a.length;i++)d+=Math.abs(a[i]-b[i]);return d*0.5;}
}
