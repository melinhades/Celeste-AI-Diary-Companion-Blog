package com.mszlu.blog;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static com.tngtech.archunit.library.dependencies.SlicesRuleDefinition.slices;

/**
 * 架构守护（每次 mvn test 自动执行，防退化）：
 * 1) 一级包之间不允许循环依赖；
 * 2) controller 不允许绕过 service 直接访问 dao.mapper。
 */
@AnalyzeClasses(packages = "com.mszlu.blog", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    @ArchTest
    static final ArchRule noPackageCycles =
            slices().matching("com.mszlu.blog.(*)..").should().beFreeOfCycles();

    @ArchTest
    static final ArchRule controllersShouldNotAccessMappers = noClasses()
            .that().resideInAPackage("..controller..")
            .should().accessClassesThat().resideInAPackage("..dao.mapper..");
}
