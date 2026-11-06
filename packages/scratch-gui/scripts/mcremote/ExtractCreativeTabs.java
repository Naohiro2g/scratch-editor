package mc_remote.tools;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

public class ExtractCreativeTabs {
    static JsonObject mapping;
    static Class<?> type(String name) throws Exception {
        JsonObject classes = mapping.getAsJsonObject("classes");
        return Class.forName(classes.has(name) ? classes.get(name).getAsString() : name);
    }
    static String member(String group, String owner, String name) {
        JsonObject entries = mapping.getAsJsonObject(group);
        String key = owner + "." + name;
        return entries.has(key) ? entries.get(key).getAsString() : name;
    }
    static Object field(String owner, String name) throws Exception {
        return type(owner).getField(member("fields", owner, name)).get(null);
    }
    static Object call(String owner, String name, Object target, Object... args) throws Exception {
        String actual = member("methods", owner, name);
        for (Method method : type(owner).getMethods()) {
            if (!method.getName().equals(actual) || method.getParameterCount() != args.length) continue;
            Class<?>[] types = method.getParameterTypes();
            boolean compatible = true;
            for (int i = 0; i < args.length; i++) {
                if (!(types[i].isInstance(args[i]) || types[i] == boolean.class && args[i] instanceof Boolean)) {
                    compatible = false;
                }
            }
            if (compatible) return method.invoke(target, args);
        }
        throw new NoSuchMethodException(owner + "." + name + "/" + args.length);
    }
    static String key(Object registry, Object value) throws Exception {
        return call("net.minecraft.core.Registry", "getKey", registry, value).toString();
    }
    static Object construct(String owner, Object... args) throws Exception {
        for (var constructor : type(owner).getConstructors()) {
            if (constructor.getParameterCount() != args.length) continue;
            Class<?>[] types = constructor.getParameterTypes();
            boolean compatible = true;
            for (int i = 0; i < args.length; i++) {
                if (!types[i].isInstance(args[i])) compatible = false;
            }
            if (compatible) return constructor.newInstance(args);
        }
        throw new NoSuchMethodException(owner + " constructor/" + args.length);
    }
    public static void main(String[] args) throws Exception {
        mapping = new Gson().fromJson(Files.readString(Path.of(args[0])), JsonObject.class);
        call("net.minecraft.SharedConstants", "tryDetectVersion", null);
        call("net.minecraft.server.Bootstrap", "bootStrap", null);
        String lookupMethod = args[2].equals("26.3") ? "createWorldLookup" : "createLookup";
        Object lookup = call("net.minecraft.data.registries.VanillaRegistries", lookupMethod, null);
        Object builder = construct("net.minecraft.server.packs.VanillaPackResourcesBuilder");
        call("net.minecraft.server.packs.VanillaPackResourcesBuilder", "pushJarResources", builder);
        call("net.minecraft.server.packs.VanillaPackResourcesBuilder", "exposeNamespace", builder,
            (Object) new String[]{"minecraft"});
        Object packInfo = construct("net.minecraft.server.packs.PackLocationInfo", "vanilla",
            call("net.minecraft.network.chat.Component", "literal", null, "vanilla"),
            field("net.minecraft.server.packs.repository.PackSource", "BUILT_IN"), Optional.empty());
        Object pack = call("net.minecraft.server.packs.VanillaPackResourcesBuilder", "build", builder, packInfo);
        Object dataPack = args[2].equals("26.3") ?
            call("net.minecraft.server.packs.VanillaPackResources", "fullResources", pack) : pack;
        Object resources = construct("net.minecraft.server.packs.resources.MultiPackResourceManager",
            field("net.minecraft.server.packs.PackType", "SERVER_DATA"), List.of(dataPack));
        Object access = call("net.minecraft.core.RegistryAccess", "fromRegistryOfRegistries", null,
            field("net.minecraft.core.registries.BuiltInRegistries", "REGISTRY"));
        for (Object pending : (Iterable<?>) call("net.minecraft.tags.TagLoader", "loadTagsForExistingRegistries",
                null, resources, access)) {
            call("net.minecraft.core.Registry$PendingTags", "apply", pending);
        }
        {
            // Datagen lookups need the vanilla tags bound before creative item stacks are constructed.
            var registries = (java.util.stream.Stream<?>) call("net.minecraft.core.HolderLookup$Provider",
                "listRegistries", lookup);
            List<Object> boundRegistries = new ArrayList<>();
            for (Object registry : registries.toList()) {
                Object registryKey = call("net.minecraft.core.HolderLookup$RegistryLookup", "key", registry);
                Object elements;
                if (args[2].equals("1.21.11")) {
                    Class<?> elementType = type("net.minecraft.tags.TagLoader$ElementLookup");
                    elements = java.lang.reflect.Proxy.newProxyInstance(elementType.getClassLoader(),
                        new Class<?>[]{elementType}, (proxy, method, arguments) -> {
                            if (method.getDeclaringClass() == Object.class) return method.invoke(registry, arguments);
                            Object elementKey = call("net.minecraft.resources.ResourceKey", "create", null,
                                registryKey, arguments[0]);
                            return call("net.minecraft.core.HolderGetter", "get", registry, elementKey);
                        });
                } else {
                    elements = call("net.minecraft.tags.TagLoader$ElementLookup", "fromGetters", null,
                        registryKey, registry, registry);
                }
                Map<?, ?> tags;
                if (args[2].equals("1.21.11")) {
                    Object directory = call("net.minecraft.core.registries.Registries", "tagsDirPath", null, registryKey);
                    Object loader = construct("net.minecraft.tags.TagLoader", elements, directory);
                    Object loaded = call("net.minecraft.tags.TagLoader", "load", loader, resources);
                    Map<?, ?> built = (Map<?, ?>) call("net.minecraft.tags.TagLoader", "build", loader, loaded);
                    Map<Object, Object> keyedTags = new HashMap<>();
                    for (var entry : built.entrySet()) {
                        Object tagKey = call("net.minecraft.tags.TagKey", "create", null, registryKey, entry.getKey());
                        keyedTags.put(tagKey, entry.getValue());
                    }
                    tags = keyedTags;
                } else {
                    tags = (Map<?, ?>) call("net.minecraft.tags.TagLoader", "loadTagsForRegistry", null,
                        resources, registryKey, elements);
                }
                Map<Object, Collection<Object>> holderTags = new IdentityHashMap<>();
                for (var entry : tags.entrySet()) for (Object holder : (Iterable<?>)entry.getValue()) {
                    holderTags.computeIfAbsent(holder, unused -> new ArrayList<>()).add(entry.getKey());
                }
                var holders = (java.util.stream.Stream<?>) call("net.minecraft.core.HolderLookup", "listElements", registry);
                Method bind = type("net.minecraft.core.Holder$Reference").getDeclaredMethod(
                    member("methods", "net.minecraft.core.Holder$Reference", "bindTags"), Collection.class);
                bind.setAccessible(true);
                for (Object holder : holders.toList()) {
                    bind.invoke(holder, holderTags.getOrDefault(holder, Collections.emptyList()));
                }
                Map<Object, Object> namedTags = new HashMap<>();
                var namedConstructor = type("net.minecraft.core.HolderSet$Named").getDeclaredConstructors()[0];
                namedConstructor.setAccessible(true);
                Method bindNamed = type("net.minecraft.core.HolderSet$Named").getDeclaredMethod(
                    member("methods", "net.minecraft.core.HolderSet$Named", "bind"), List.class);
                bindNamed.setAccessible(true);
                for (var entry : tags.entrySet()) {
                    Object named = namedConstructor.newInstance(registry, entry.getKey());
                    bindNamed.invoke(named, entry.getValue());
                    namedTags.put(entry.getKey(), named);
                }
                Class<?> lookupType = type("net.minecraft.core.HolderLookup$RegistryLookup");
                Object bound = java.lang.reflect.Proxy.newProxyInstance(lookupType.getClassLoader(),
                    new Class<?>[]{lookupType}, (proxy, method, arguments) -> {
                        if (arguments != null && arguments.length == 1 &&
                                type("net.minecraft.tags.TagKey").isInstance(arguments[0])) {
                            Object named = namedTags.get(arguments[0]);
                            if (method.getReturnType() == Optional.class) return Optional.ofNullable(named);
                            if (named == null) throw new IllegalStateException("Missing vanilla tag: " + arguments[0]);
                            return named;
                        }
                        if (method.getName().equals(member("methods", "net.minecraft.core.HolderLookup", "listTags"))) {
                            return namedTags.values().stream();
                        }
                        if (method.isDefault()) {
                            return java.lang.reflect.InvocationHandler.invokeDefault(proxy, method, arguments);
                        }
                        return method.invoke(registry, arguments);
                    });
                boundRegistries.add(bound);
            }
            lookup = call("net.minecraft.core.HolderLookup$Provider", "create", null, boundRegistries.stream());
        }
        if (!args[2].equals("1.21.11")) {
            Object initializers = field("net.minecraft.core.registries.BuiltInRegistries", "DATA_COMPONENT_INITIALIZERS");
            for (Object pending : (Iterable<?>) call("net.minecraft.core.component.DataComponentInitializers",
                    "build", initializers, lookup)) {
                call("net.minecraft.core.component.DataComponentInitializers$PendingComponents", "apply", pending);
            }
        }
        Object flags = field("net.minecraft.world.flag.FeatureFlags", "DEFAULT_FLAGS");
        call("net.minecraft.world.item.CreativeModeTabs", "tryRebuildTabContents", null, flags, true, lookup);
        Object blockRegistry = field("net.minecraft.core.registries.BuiltInRegistries", "BLOCK");
        Object itemRegistry = field("net.minecraft.core.registries.BuiltInRegistries", "ITEM");
        Object tabRegistry = field("net.minecraft.core.registries.BuiltInRegistries", "CREATIVE_MODE_TAB");
        Object categoryType = field("net.minecraft.world.item.CreativeModeTab$Type", "CATEGORY");
        Map<String, Set<String>> blocksByItem = new TreeMap<>();
        for (Object block : (Iterable<?>) blockRegistry) {
            Object item = call("net.minecraft.world.level.ItemLike", "asItem", block);
            String itemId = key(itemRegistry, item);
            if (itemId.equals("minecraft:air")) continue;
            blocksByItem.computeIfAbsent(itemId, unused -> new TreeSet<>()).add(key(blockRegistry, block));
        }
        List<Map<String, Object>> tabs = new ArrayList<>();
        for (Object tab : (Iterable<?>) tabRegistry) {
            if (!categoryType.equals(call("net.minecraft.world.item.CreativeModeTab", "getType", tab))) continue;
            Object title = call("net.minecraft.world.item.CreativeModeTab", "getDisplayName", tab);
            Object contents = call("net.minecraft.network.chat.Component", "getContents", title);
            String translationKey = (String) call("net.minecraft.network.chat.contents.TranslatableContents",
                "getKey", contents);
            Set<String> blockIds = new TreeSet<>();
            Set<String> itemIds = new TreeSet<>();
            for (Object stack : (Iterable<?>) call("net.minecraft.world.item.CreativeModeTab", "getDisplayItems", tab)) {
                Object item = call("net.minecraft.world.item.ItemStack", "getItem", stack);
                String id = key(itemRegistry, item);
                itemIds.add(id);
                blockIds.addAll(blocksByItem.getOrDefault(id, Collections.emptySet()));
            }
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", key(tabRegistry, tab));
            result.put("translationKey", translationKey);
            result.put("items", itemIds);
            result.put("blocks", blockIds);
            tabs.add(result);
        }
        Files.writeString(Path.of(args[1]), new Gson().toJson(tabs) + "\n");
    }
}
