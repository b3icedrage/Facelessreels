package app.ghostclipper;

import android.app.*;
import android.content.*;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.MediaRecorder;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.*;
import android.util.DisplayMetrics;
import android.view.WindowManager;
import java.io.File;
import java.util.ArrayDeque;
import java.util.ArrayList;

/**
 * Screen-capture recorder for live highlight capture.
 * Keeps a bounded rolling set of short MP4 segments. A chat spike freezes the
 * preceding segments and records a short post-roll before publishing the clip parts.
 */
public final class LiveScreenRecorderService extends Service {
    public static volatile boolean isActive=false;
    public static final String ACTION_START="app.ghostclipper.RECORD_START";
    public static final String ACTION_SPIKE="app.ghostclipper.RECORD_SPIKE";
    public static final String ACTION_STOP="app.ghostclipper.RECORD_STOP";
    public static final String EXTRA_RESULT_CODE="resultCode";
    public static final String EXTRA_DATA="projectionData";
    public static final String BROADCAST="app.ghostclipper.RECORD_EVENT";
    public static final String EXTRA_MESSAGE="message";
    public static final String EXTRA_FILES="files";
    private static final String CHANNEL="ghost_live_capture";
    private static final int NOTIFICATION_ID=7314;
    private static final long SEGMENT_MS=15000L, POST_ROLL_MS=10000L;
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final ArrayDeque<File> ring=new ArrayDeque<>();
    private MediaProjection projection;
    private VirtualDisplay display;
    private MediaRecorder recorder;
    private File currentFile;
    private int width,height,density;
    private boolean triggered=false, recording=false, finishing=false;
    private final Runnable rotateTask=()->rotateSegment();
    private final Runnable finishTask=()->finishCapture();

    @Override public void onCreate(){super.onCreate();createChannel();}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent==null)return START_NOT_STICKY;
        String action=intent.getAction();
        if(ACTION_START.equals(action)){
            isActive=true;
            int code=intent.getIntExtra(EXTRA_RESULT_CODE,Activity.RESULT_CANCELED);
            Intent data=intent.getParcelableExtra(EXTRA_DATA);
            if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFICATION_ID,notification("Rolling video buffer active"),android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION);else startForeground(NOTIFICATION_ID,notification("Rolling video buffer active"));
            try{beginProjection(code,data);}catch(Exception e){isActive=false;broadcast("Could not start screen recording: "+e.getMessage(),null);stopSelf();}
        }else if(ACTION_SPIKE.equals(action)){
            if(recording&&!triggered){triggered=true;handler.removeCallbacks(rotateTask);broadcast("Chat spike detected. Saving the previous 45 seconds and 10 seconds after the spike.",null);handler.postDelayed(finishTask,POST_ROLL_MS);}
        }else if(ACTION_STOP.equals(action)){finishCapture();}
        return START_NOT_STICKY;
    }
    private void beginProjection(int resultCode,Intent data)throws Exception{
        if(resultCode!=Activity.RESULT_OK||data==null)throw new IllegalStateException("Screen capture permission was not granted.");
        WindowManager wm=(WindowManager)getSystemService(WINDOW_SERVICE);
        DisplayMetrics dm=new DisplayMetrics();wm.getDefaultDisplay().getRealMetrics(dm);
        width=Math.max(2,dm.widthPixels&~1);height=Math.max(2,dm.heightPixels&~1);density=dm.densityDpi;
        MediaProjectionManager manager=(MediaProjectionManager)getSystemService(MEDIA_PROJECTION_SERVICE);
        projection=manager.getMediaProjection(resultCode,data);
        if(projection==null)throw new IllegalStateException("Android did not create a screen capture session.");
        projection.registerCallback(new MediaProjection.Callback(){@Override public void onStop(){finishCapture();}},handler);
        recording=true;triggered=false;ring.clear();startSegment();
    }
    private File newSegment(){File dir=new File(getExternalFilesDir(null),"live_buffer");if(!dir.exists()&&!dir.mkdirs())throw new IllegalStateException("Cannot create video buffer folder.");return new File(dir,"buffer_"+System.currentTimeMillis()+".mp4");}
    private void startSegment(){
        try{
            currentFile=newSegment();
            if(android.os.Build.VERSION.SDK_INT>=31)recorder=new MediaRecorder(this);else recorder=new MediaRecorder();
            recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setOutputFile(currentFile.getAbsolutePath());
            recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);
            recorder.setVideoSize(width,height);
            recorder.setVideoFrameRate(30);
            recorder.setVideoEncodingBitRate(4500000);
            recorder.prepare();
            if(display==null)display=projection.createVirtualDisplay("GhostClipperBuffer",width,height,density,DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,recorder.getSurface(),null,handler);
            else display.setSurface(recorder.getSurface());
            recorder.start();
            handler.removeCallbacks(rotateTask);handler.postDelayed(rotateTask,SEGMENT_MS);
            broadcast("Video buffer active • retaining up to 60 seconds",null);
        }catch(Exception e){broadcast("Video buffer failed: "+e.getMessage(),null);finishCapture();}
    }
    private void rotateSegment(){
        if(!recording||triggered||finishing)return;
        File finished=currentFile;stopRecorderOnly();
        if(finished!=null&&finished.exists()&&finished.length()>0){ring.addLast(finished);while(ring.size()>4){File old=ring.removeFirst();old.delete();}}
        startSegment();
    }
    private void stopRecorderOnly(){
        if(recorder!=null){try{recorder.stop();}catch(Exception ignored){}try{recorder.reset();recorder.release();}catch(Exception ignored){}recorder=null;}
    }
    private void finishCapture(){
        if(finishing)return;finishing=true;recording=false;isActive=false;handler.removeCallbacks(rotateTask);handler.removeCallbacks(finishTask);
        File last=currentFile;
        if(display!=null){try{display.setSurface(null);display.release();}catch(Exception ignored){}display=null;}
        stopRecorderOnly();
        if(last!=null&&last.exists()&&last.length()>0)ring.addLast(last);
        if(projection!=null){try{projection.stop();}catch(Exception ignored){}projection=null;}
        if(triggered){
            ArrayList<String> paths=new ArrayList<>();for(File f:ring)if(f.exists()&&f.length()>0)paths.add(f.getAbsolutePath());
            if(paths.isEmpty()){broadcast("No usable video segments were captured.",null);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return;}
            new Thread(()->{
                try{
                    File out=new File(getExternalFilesDir(null),"GhostClip_"+System.currentTimeMillis()+".mp4");
                    Mp4SegmentMerger.merge(paths,out);
                    for(String p:paths)new File(p).delete();
                    ArrayList<String> result=new ArrayList<>();result.add(out.getAbsolutePath());
                    broadcast("Highlight MP4 ready: "+out.getAbsolutePath(),result);
                }catch(Exception e){broadcast("Could not assemble highlight MP4: "+e.getMessage(),paths);}
                stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();
            },"GhostClip-Merge").start();
        }else{broadcast("Screen recording buffer stopped.",null);stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    }
    private void broadcast(String message,ArrayList<String> files){
        Intent i=new Intent(BROADCAST);i.setPackage(getPackageName());i.putExtra(EXTRA_MESSAGE,message);if(files!=null)i.putStringArrayListExtra(EXTRA_FILES,files);sendBroadcast(i);
    }
    private void createChannel(){if(Build.VERSION.SDK_INT>=26){NotificationChannel c=new NotificationChannel(CHANNEL,"Live video capture",NotificationManager.IMPORTANCE_LOW);getSystemService(NotificationManager.class).createNotificationChannel(c);}}
    private Notification notification(String text){
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CHANNEL):new Notification.Builder(this);
        return b.setSmallIcon(android.R.drawable.presence_video_online).setContentTitle("Ghost Clipper").setContentText(text).setOngoing(true).build();
    }
    @Override public void onDestroy(){handler.removeCallbacksAndMessages(null);if(recording||projection!=null)finishCapture();super.onDestroy();}
    @Override public android.os.IBinder onBind(Intent intent){return null;}
}