package expo.modules.deckforgehealth
import android.app.Activity
import android.os.Bundle
import android.widget.TextView
class HealthRationaleActivity: Activity() {
 override fun onCreate(state:Bundle?) { super.onCreate(state);setContentView(TextView(this).apply { text="DeckForge optional activity access: read steps only after consent, while the app is open. No GPS or background read. Local records are not trusted reward proof. Denial does not prevent games or nonwalking quests. Change permissions in Health Connect settings. Current development builds do not submit or award activity rewards."; textSize=20f;setPadding(32,48,32,32) }) }
}
