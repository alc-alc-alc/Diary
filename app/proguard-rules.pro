# Игнорировать отсутствующие аннотации Error Prone (используются в Tink/EncryptedSharedPreferences)
-dontwarn com.google.errorprone.annotations.**
# Правила для kotlinx.serialization
-keepattributes *Annotation*
-keep class kotlinx.serialization.** { *; }
-keep class **$$serializer { *; }
-keepclassmembers class * {
    kotlinx.serialization.KSerializer serializer(...);
}