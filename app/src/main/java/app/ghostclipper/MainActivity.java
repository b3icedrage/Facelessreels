package app.ghostclipper;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.media.MediaMetadataRetriever;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.widget.*;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MimeTypes;
import androidx.media3.transformer.Composition;
import androidx.media3.transformer.EditedMediaItem;
import androidx.media3.transformer.Effects;
import androidx.media3.transformer.ExportException;
import androidx.media3.transformer.ExportResult;
import androidx.media3.effect.Presentation;
import androidx.media3.transformer.Transformer;
import java.io.*;
import java.util.Collections;

public class MainActivity extends AppCompatActivity {
    private static final int PICK_VIDEO=10, SAVE_VIDEO=11, SAVE_SRT=12, PICK_CHAT=13;
    private Uri source;
    private long durationMs=-1;
    private File rendered;
    private String pendingSrt;
    private java.util.Map<Long, Double> chatActivity = new java.util.HashMap<>();
    private Transformer transformer;
    private boolean isExporting=false;
    private TextView sourceLabel, durationLabel, status;
    private EditText startField, endField;
    private CheckBox portrait, mute;
    private Button export, cancel;
    private ProgressBar progress;

    private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density+0.5f);}
    @Override public void onCreate(@Nullable Bundle state){super.onCreate(state); buildUi();}

    private void buildUi(){
        ScrollView scroll=new ScrollView(this);
        scroll.setBackgroundColor(Color.rgb(9,13,18));
        LinearLayout root=new LinearLayout(this); root.setOrientation(1);
        root.setPadding(dp(20),dp(28),dp(20),dp(28)); scroll.addView(root);

        TextView logo=label("GHOST CLIPPER",25,Color.rgb(0,217,232),true);
        root.addView(logo);
        TextView sub=label("LOCAL VIDEO CLIPPER  •  FREE  •  NO ACCOUNT",11,Color.LTGRAY,false);
        LinearLayout.LayoutParams sp=new LinearLayout.LayoutParams(-1,-2);sp.topMargin=dp(6);root.addView(sub,sp);
        gap(root,28);
        root.addView(label("01  SOURCE VIDEO",14,Color.WHITE,true));
        Button choose=button("Choose video from phone");root.addView(choose);
        choose.setOnClickListener(v->pickSource());
        sourceLabel=label("No video selected",13,Color.LTGRAY,false);gap(root,8);root.addView(sourceLabel);
        durationLabel=label("",12,Color.GRAY,false);root.addView(durationLabel);
        gap(root,18);
        root.addView(label("02  SMART TOOLS",14,Color.WHITE,true));
        Button highlights=button("Find highlight moments");
        root.addView(highlights);
        highlights.setOnClickListener(v->findHighlights());
        Button captions=button("Generate AI captions (offline model)");
        root.addView(captions);
        captions.setOnClickListener(v->generateCaptions());
        gap(root,22);
        root.addView(label("03  CLIP RANGE (SECONDS)",14,Color.WHITE,true));
        LinearLayout row=new LinearLayout(this);row.setOrientation(0);
        startField=numberField("Start","0");endField=numberField("End","30");
        LinearLayout.LayoutParams w=new LinearLayout.LayoutParams(0,dp(54),1);w.rightMargin=dp(6);row.addView(startField,w);
        LinearLayout.LayoutParams w2=new LinearLayout.LayoutParams(0,dp(54),1);w2.leftMargin=dp(6);row.addView(endField,w2);root.addView(row);
        gap(root,14);
        portrait=new CheckBox(this);portrait.setText("Crop to vertical 9:16 (Shorts / Reels)");portrait.setTextColor(Color.WHITE);portrait.setChecked(true);root.addView(portrait);
        mute=new CheckBox(this);mute.setText("Remove original audio");mute.setTextColor(Color.WHITE);root.addView(mute);
        gap(root,22);
        root.addView(label("04  RENDER MP4",14,Color.WHITE,true));
        export=button("Export clip");root.addView(export);export.setOnClickListener(v->startExport());
        cancel=button("Cancel export");cancel.setVisibility(View.GONE);root.addView(cancel);cancel.setOnClickListener(v->cancelExport());
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setIndeterminate(true);progress.setVisibility(View.GONE);
        LinearLayout.LayoutParams pp=new LinearLayout.LayoutParams(-1,dp(5));pp.topMargin=dp(14);root.addView(progress,pp);
        status=label("Choose a source video to begin.",13,Color.rgb(198,255,0),false);
        LinearLayout.LayoutParams st=new LinearLayout.LayoutParams(-1,-2);st.topMargin=dp(14);root.addView(status,st);
        gap(root,26);
        TextView foot=label("ON-DEVICE PROCESSING  •  NO API KEY REQUIRED",10,Color.GRAY,false);foot.setGravity(Gravity.CENTER);root.addView(foot);
        setContentView(scroll);
    }

    private TextView label(String s,int size,int color,boolean bold){TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setTextColor(color);if(bold)t.setTypeface(Typeface.DEFAULT,Typeface.BOLD);return t;}
    private void gap(LinearLayout p,int h){View v=new View(this);p.addView(v,new LinearLayout.LayoutParams(1,dp(h)));}
    private Button button(String s){Button b=new Button(this);b.setText(s);b.setAllCaps(false);b.setTextColor(Color.BLACK);b.setTypeface(Typeface.DEFAULT,Typeface.BOLD);b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(0,217,232)));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,dp(52));p.topMargin=dp(9);b.setLayoutParams(p);return b;}
    private EditText numberField(String hint,String value){EditText e=new EditText(this);e.setSingleLine(true);e.setText(value);e.setHint(hint);e.setTextColor(Color.WHITE);e.setHintTextColor(Color.GRAY);e.setInputType(8194);e.setPadding(dp(10),0,dp(10),0);e.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(0,217,232)));return e;}

    private void pickSource(){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("video/*");i.addCategory(Intent.CATEGORY_OPENABLE);i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);startActivityForResult(i,PICK_VIDEO);}
    @Override protected void onActivityResult(int req,int res,@Nullable Intent data){super.onActivityResult(req,res,data);if(res!=RESULT_OK||data==null||data.getData()==null)return;
        if(req==PICK_VIDEO){source=data.getData();try{getContentResolver().takePersistableUriPermission(source,Intent.FLAG_GRANT_READ_URI_PERMISSION);}catch(Exception ignored){} inspectSource();}
        else if(req==SAVE_VIDEO)copyTo(data.getData());
        else if(req==SAVE_SRT)writeSrt(data.getData());
        else if(req==PICK_CHAT)loadChatReplay(data.getData());
    }
    private void inspectSource(){MediaMetadataRetriever m=new MediaMetadataRetriever();try{m.setDataSource(this,source);String d=m.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);durationMs=d==null?-1:Long.parseLong(d);}catch(Exception e){status.setText("Cannot read selected video: "+e.getMessage());}finally{try{m.release();}catch(Exception ignored){}}
        String name=source.getLastPathSegment();sourceLabel.setText(name==null?"Video selected":name);
        if(durationMs>0){durationLabel.setText(String.format(java.util.Locale.US,"Duration %.1f seconds",durationMs/1000.0));endField.setText(String.format(java.util.Locale.US,"%.1f",Math.min(30.0,durationMs/1000.0)));status.setText("Source ready. Set your clip range.");}
    }
    private void startExport(){
        if(source==null){status.setText("Choose a video first.");return;}
        double a,b;try{a=Double.parseDouble(startField.getText().toString());b=Double.parseDouble(endField.getText().toString());}catch(Exception e){status.setText("Enter valid start and end times.");return;}
        if(a<0||b<=a||b-a<1){status.setText("End must be after start and clip must be at least 1 second.");return;}
        if(durationMs>0&&b*1000>durationMs+250){status.setText("End time exceeds source duration.");return;}
        rendered=new File(getCacheDir(),"ghostclip_"+System.currentTimeMillis()+".mp4");
        MediaItem item=new MediaItem.Builder().setUri(source).setClippingConfiguration(new MediaItem.ClippingConfiguration.Builder().setStartPositionMs(Math.round(a*1000)).setEndPositionMs(Math.round(b*1000)).build()).build();
        java.util.List<androidx.media3.common.Effect> videoEffects=portrait.isChecked()?Collections.singletonList(Presentation.createForWidthAndHeight(1080,1920,Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP)):Collections.emptyList();
        Effects effects=new Effects(Collections.emptyList(),videoEffects);
        EditedMediaItem edited=new EditedMediaItem.Builder(item).setEffects(effects).setRemoveAudio(mute.isChecked()).build();
        transformer=new Transformer.Builder(this).setVideoMimeType(MimeTypes.VIDEO_H264).setAudioMimeType(MimeTypes.AUDIO_AAC)
            .addListener(new Transformer.Listener(){
                @Override public void onCompleted(Composition c,ExportResult r){isExporting=false;setBusy(false);status.setText("Render complete. Choose where to save the MP4.");saveDialog();}
                @Override public void onError(Composition c,ExportResult r,ExportException e){isExporting=false;setBusy(false);status.setText("Export failed: "+e.getMessage());}
            }).build();
        isExporting=true;setBusy(true);status.setText("Rendering on this phone. Keep Ghost Clipper open...");
        try{transformer.start(edited,rendered.getAbsolutePath());}catch(Exception e){isExporting=false;setBusy(false);status.setText("Could not start render: "+e.getMessage());}
    }

    private void pickChatReplay(){
        Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("text/*");i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,PICK_CHAT);
    }
    private void loadChatReplay(Uri uri){
        try(InputStream in=getContentResolver().openInputStream(uri)){
            if(in==null)throw new IOException("Cannot open chat replay");
            chatActivity=ChatReplayAnalyzer.read(in);
            status.setText("Chat replay loaded: "+chatActivity.size()+" five-second activity windows. Run highlight detection to combine chat spikes with scene changes.");
        }catch(Exception e){status.setText("Could not read chat CSV: "+e.getMessage());}
    }

    private void findHighlights(){
        if(source==null){status.setText("Choose a video first.");return;}
        status.setText(chatActivity.isEmpty()?"Scanning scene changes. This may take a moment...":"Scoring scene changes and chat activity spikes...");
        new Thread(()->{
            try{
                java.util.List<HighlightDetector.Moment> moments=HighlightDetector.detect(this,source,durationMs,chatActivity);
                runOnUiThread(()->{
                    if(moments.isEmpty()){status.setText("No clear scene changes found. Try a longer video.");return;}
                    StringBuilder msg=new StringBuilder("Suggested moments: ");
                    for(int i=0;i<moments.size();i++){
                        HighlightDetector.Moment m=moments.get(i);
                        if(i>0)msg.append("  •  ");
                        msg.append(String.format(java.util.Locale.US,"%.0f–%.0fs",m.startMs/1000.0,m.endMs/1000.0));
                    }
                    HighlightDetector.Moment best=moments.get(0);
                    startField.setText(String.format(java.util.Locale.US,"%.1f",best.startMs/1000.0));
                    endField.setText(String.format(java.util.Locale.US,"%.1f",best.endMs/1000.0));
                    status.setText(msg.toString()+(chatActivity.isEmpty()?" (scene-change suggestions; review before export)":" (scene + chat-activity ranking; review before export)"));
                });
            }catch(Exception e){runOnUiThread(()->status.setText("Highlight scan failed: "+e.getMessage()));}
        }).start();
    }

    private void generateCaptions(){
        if(source==null){status.setText("Choose a video first.");return;}
        status.setText("Preparing offline speech model (first run downloads about 40 MB)...");
        new Thread(()->{
            try{
                File modelDir=VoskCaptioner.ensureModel(this);
                String srt=VoskCaptioner.transcribe(this,source,modelDir);
                runOnUiThread(()->{
                    pendingSrt=srt;
                    Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/x-subrip");
                    i.putExtra(Intent.EXTRA_TITLE,"GhostClipper_Captions.srt");
                    status.setText("Transcription complete. Choose where to save the SRT captions.");
                    startActivityForResult(i,SAVE_SRT);
                });
            }catch(Exception e){runOnUiThread(()->status.setText("Caption generation failed: "+e.getMessage()));}
        }).start();
    }

    private void writeSrt(Uri destination){
        if(pendingSrt==null)return;
        try(OutputStream out=getContentResolver().openOutputStream(destination,"w")){
            if(out==null)throw new IOException("Could not open subtitle destination");
            out.write(pendingSrt.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            out.flush();status.setText("AI captions saved as SRT.");
        }catch(Exception e){status.setText("Could not save captions: "+e.getMessage());}
    }

    private void setBusy(boolean busy){export.setEnabled(!busy);cancel.setVisibility(busy?View.VISIBLE:View.GONE);progress.setVisibility(busy?View.VISIBLE:View.GONE);}
    private void cancelExport(){if(transformer!=null&&isExporting){transformer.cancel();isExporting=false;setBusy(false);if(rendered!=null)rendered.delete();status.setText("Export cancelled.");}}
    private void saveDialog(){Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("video/mp4");i.putExtra(Intent.EXTRA_TITLE,"GhostClip_"+System.currentTimeMillis()+".mp4");startActivityForResult(i,SAVE_VIDEO);}
    private void copyTo(Uri dest){if(rendered==null||!rendered.exists()){status.setText("Rendered file not found.");return;}try(InputStream in=new FileInputStream(rendered);OutputStream out=getContentResolver().openOutputStream(dest,"w")){if(out==null)throw new IOException("Cannot open destination");byte[] buf=new byte[65536];int n;while((n=in.read(buf))!=-1)out.write(buf,0,n);out.flush();rendered.delete();status.setText("Saved. Your MP4 is ready.");Toast.makeText(this,"Ghost Clipper: saved",Toast.LENGTH_LONG).show();}catch(Exception e){status.setText("Save failed: "+e.getMessage());}}
}
