package expo.modules.deckforgehealth
import android.content.Context
import android.content.Intent
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import java.time.Instant
import kotlinx.coroutines.runBlocking

class DeckForgeHealthModule: Module() {
 private val permission=HealthPermission.getReadPermission(StepsRecord::class)
 private lateinit var launcher:AppContextActivityResultLauncher<String,Set<String>>
 private fun context()=requireNotNull(appContext.reactContext)
 private fun foreground(){check(appContext.currentActivity?.hasWindowFocus()==true){"FOREGROUND_REQUIRED"}}
 override fun definition()=ModuleDefinition {
  Name("DeckForgeHealth")
  RegisterActivityContracts {
   launcher=registerForActivityResult(object:AppContextActivityResultContract<String,Set<String>> {
    private val contract=PermissionController.createRequestPermissionResultContract()
    override fun createIntent(context:Context,input:String):Intent=contract.createIntent(context,setOf(permission))
    override fun parseResult(input:String,resultCode:Int,intent:Intent?):Set<String> = contract.parseResult(resultCode,intent)
   }) { _,_ -> }
  }
  AsyncFunction("permission") {
   if(HealthConnectClient.getSdkStatus(context())!=HealthConnectClient.SDK_AVAILABLE) "UNAVAILABLE"
   else if(runBlocking { HealthConnectClient.getOrCreate(context()).permissionController.getGrantedPermissions().contains(permission) }) "GRANTED" else "NOT_REQUESTED"
  }
  AsyncFunction("requestPermission") Coroutine {
   foreground()
   if(HealthConnectClient.getSdkStatus(context())!=HealthConnectClient.SDK_AVAILABLE) "UNAVAILABLE"
   else if(launcher.launch("steps").contains(permission)) "GRANTED" else "DENIED"
  }
  AsyncFunction("read") Coroutine { start:String,end:String ->
   foreground();val from=Instant.parse(start);val to=Instant.parse(end)
   require(to>from&&to.toEpochMilli()-from.toEpochMilli()<=86400000&&to<=Instant.now().plusSeconds(60))
   val client=HealthConnectClient.getOrCreate(context())
   if(!client.permissionController.getGrantedPermissions().contains(permission)) mapOf("permission" to "DENIED","samples" to emptyList<Any>(),"truncated" to false)
   else {
    val page=client.readRecords(ReadRecordsRequest(StepsRecord::class,timeRangeFilter=TimeRangeFilter.between(from,to),pageSize=1000))
    foreground()
    val rows=page.records.filter { it.startTime>=from&&it.endTime<=to }.map { r->mapOf("source" to "HEALTH_CONNECT","recordId" to r.metadata.id,"origin" to r.metadata.dataOrigin.packageName,"revision" to r.metadata.lastModifiedTime.toString(),"start" to r.startTime.toString(),"end" to r.endTime.toString(),"steps" to r.count,"manual" to (r.metadata.recordingMethod==Metadata.RECORDING_METHOD_MANUAL_ENTRY)) }
    mapOf("permission" to "GRANTED","samples" to rows,"truncated" to (page.pageToken!=null))
   }
  }
 }
}
