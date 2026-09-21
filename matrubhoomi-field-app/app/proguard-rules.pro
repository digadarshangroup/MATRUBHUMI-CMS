# Nothing to keep by name: this app uses no reflection-based JSON mapping (see
# data/Models.kt on why org.json rather than a serializer), so R8's defaults plus
# the AndroidX/OkHttp consumer rules are sufficient.
-dontwarn org.bouncycastle.**
-dontwarn org.conscrypt.**
-dontwarn org.openjsse.**
