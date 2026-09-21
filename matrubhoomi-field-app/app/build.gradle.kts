plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.matrubhoomi.field"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.matrubhoomi.field"
        // 26 (Oreo) is the floor for the background-execution model this app is
        // built on — foreground services with a typed notification, JobScheduler
        // behind WorkManager. Below it, everything here would need a second
        // implementation for a handful of handsets nobody in the field carries.
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"

        // The API's address is a BUILD input, not a constant. The field team's
        // handsets point at production; a developer's points at their laptop on
        // the office LAN, and neither should need a code change.
        //
        //   ./gradlew assembleDebug -PapiUrl=http://192.168.1.9:5000
        val apiUrl = (project.findProperty("apiUrl") as String?)
            ?: "https://api.matrubhoomifarms.in"
        buildConfigField("String", "API_URL", "\"$apiUrl\"")
    }

    buildTypes {
        debug {
            // Cleartext is allowed in debug ONLY, through a separate network
            // security config — see res/xml/network_security_config_debug.xml.
            // A laptop on the LAN is http://, and forcing https there would
            // make the app untestable without a certificate nobody has.
            applicationIdSuffix = ".debug"
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-service:2.8.7")

    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")
    implementation("androidx.navigation:navigation-compose:2.8.5")

    // The offline spine. WorkManager survives process death and reboots, which
    // is the entire reason a submission taken in a field with no signal still
    // arrives; a coroutine in the app's own scope does not.
    implementation("androidx.work:work-runtime-ktx:2.10.0")

    // Fused location — the only source on Android that fuses GPS, wifi and the
    // cell network and reports its own accuracy honestly.
    implementation("com.google.android.gms:play-services-location:21.3.0")

    implementation("com.squareup.okhttp3:okhttp:4.12.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
}
